import { PrismaVectorStore } from '@langchain/community/vectorstores/prisma';
import { TokenUsage } from '@langchain/core/language_models/base';
import { ChatPromptTemplate, MessagesPlaceholder } from '@langchain/core/prompts';
import { ChainValues } from '@langchain/core/utils/types';
import { ChatMistralAI, MistralAIEmbeddings } from '@langchain/mistralai';
import { InitiativeLlmDocument, Prisma, Settings, ToolLlmDocument } from '@prisma/client';
import assert from 'assert';
import { CronJob } from 'cron';
import { minutesToMilliseconds } from 'date-fns/minutesToMilliseconds';
import { subHours } from 'date-fns/subHours';
import fs from 'fs/promises';
import { LLMChain } from 'langchain/chains';
import { createStuffDocumentsChain } from 'langchain/chains/combine_documents';
import { createRetrievalChain } from 'langchain/chains/retrieval';
import { BufferMemory } from 'langchain/memory';
import mistralTokenizer from 'mistral-tokenizer-js';
import path from 'path';
import { z } from 'zod';

import { ChunkEventEmitter, LlmManager, extractFirstJsonCodeContentFromMarkdown } from '@etabli/src/features/llm';
import { gptInstances, gptSeed } from '@etabli/src/gpt';
import { DocumentInitiativeTemplateSchema, ResultSchema, ResultSchemaType } from '@etabli/src/gpt/template';
import { tokensReachTheLimitError } from '@etabli/src/models/entities/errors';
import { prisma } from '@etabli/src/prisma';
import { watchGracefulExitInLoop } from '@etabli/src/server/system';
import { linkRegistry } from '@etabli/src/utils/routes/registry';
import { sleep } from '@etabli/src/utils/sleep';

export interface Session {
  history: BufferMemory;
  lastRequestAt: Date;
  running: boolean;
}

export type Sessions = {
  [key in string]: Session;
};

export class LangchainWithLocalVectorStoreLlmManager implements LlmManager {
  public readonly mistralaiClient;
  public readonly toolsVectorStore;
  public readonly initiativesVectorStore;
  public readonly gptInstance = gptInstances['tiny'];
  public readonly sessions: Sessions = {}; // To not overcomplexify the logic we go with memory history considering just 1 instance of the product (or if more, with sticky IP to target the same instance for the same user)
  public readonly cleanHistoryJob;

  public constructor() {
    this.mistralaiClient = new ChatMistralAI({
      apiKey: process.env.MISTRAL_API_KEY,
      modelName: 'mistral-tiny',
      temperature: 0, // Less creative answer, more deterministic
      streaming: false,
      topP: 1,
      // maxTokens: null, // Disabled by default but the typing "null" is not supported despite in the documentation
      safeMode: false,
      randomSeed: gptSeed,
      verbose: false,
      // lc_serializable: xxx, // Cannot find what it is
    });

    this.toolsVectorStore = PrismaVectorStore.withModel<ToolLlmDocument>(prisma).create(new MistralAIEmbeddings(), {
      prisma: Prisma,
      tableName: 'ToolLlmDocument',
      vectorColumnName: 'vector',
      columns: {
        id: PrismaVectorStore.IdColumn,
        content: PrismaVectorStore.ContentColumn,
      },
    });

    this.initiativesVectorStore = PrismaVectorStore.withModel<InitiativeLlmDocument>(prisma).create(new MistralAIEmbeddings(), {
      prisma: Prisma,
      tableName: 'InitiativeLlmDocument',
      vectorColumnName: 'vector',
      columns: {
        id: PrismaVectorStore.IdColumn,
        content: PrismaVectorStore.ContentColumn,
      },
    });

    // We want to avoid memory leak due to conversations but also for data privacy (the UUID is not guessable, but we limit the risk)
    this.cleanHistoryJob = new CronJob(
      '0 * * * *', // Every hour
      () => {
        const historyExpirationAt = subHours(new Date(), 6); // If a conversation has more than 6 hours, delete it

        for (let sessionId in this.sessions) {
          if (this.sessions[sessionId].lastRequestAt < historyExpirationAt) {
            delete this.sessions[sessionId];
          }
        }

        console.log(`an history clean of conversation sessions has been performed`);
      },
      null,
      false,
      'Europe/Paris'
    );
  }

  public async init() {
    // The vector stores are created from the database schema

    // Reset the database
    await prisma.settings.update({
      where: {
        onlyTrueAsId: true,
      },
      data: {
        updateIngestedInitiatives: false,
        updateIngestedTools: false,
      },
    });
  }

  public async clean(): Promise<void> {
    await prisma.toolLlmDocument.deleteMany({});
    await prisma.initiativeLlmDocument.deleteMany({});
  }

  public async startHistoryCleaner(): Promise<void> {
    this.cleanHistoryJob.start();
  }

  public async stopHistoryCleaner(): Promise<void> {
    this.cleanHistoryJob.stop();
  }

  public async ingestTools(settings: Settings): Promise<void> {
    // Synchronizing properly for ingestion
    const toolLlmDocumentsToCalculate = await prisma.$transaction(
      async (tx) => {
        const tools = await tx.tool.findMany({
          include: {
            ToolLlmDocument: true,
          },
          orderBy: [
            {
              name: 'asc',
            },
          ],
        });

        if (tools.length === 0) {
          throw new Error('it seems you did not populate tools into the data, which is required to export them to the llm system');
        }

        await tx.toolLlmDocument.deleteMany({
          where: {
            toolId: {
              notIn: tools.map((tool) => tool.id),
            },
          },
        });

        const toolDocumentsToCalculate: ToolLlmDocument[] = [];

        for (const tool of tools) {
          watchGracefulExitInLoop();

          if (!!tool.ToolLlmDocument) {
            // If the document has not been calculated since the last initive update, we make sure to update the content and mark it to be processed
            if (!tool.ToolLlmDocument.calculatedAt || tool.ToolLlmDocument.calculatedAt < tool.updatedAt) {
              const updatedDocument = await tx.toolLlmDocument.update({
                where: {
                  toolId: tool.id,
                },
                data: {
                  content: tool.name,
                },
              });

              toolDocumentsToCalculate.push(updatedDocument);
            }
          } else {
            const createdDocument = await tx.toolLlmDocument.create({
              data: {
                toolId: tool.id,
                content: tool.name,
              },
            });

            toolDocumentsToCalculate.push(createdDocument);
          }
        }

        return toolDocumentsToCalculate;
      },
      {
        timeout: minutesToMilliseconds(process.env.NODE_ENV !== 'production' ? 10 : 2),
        isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted,
      }
    );

    if (toolLlmDocumentsToCalculate.length > 0) {
      // `addModels` recalculates the vector so we use it both for created documents and those to update
      // Note: this is out of the transaction because it could takes time to compute
      await this.toolsVectorStore.addModels(toolLlmDocumentsToCalculate);

      await prisma.toolLlmDocument.updateMany({
        where: {
          id: {
            in: toolLlmDocumentsToCalculate.map((document) => document.id),
          },
        },
        data: {
          calculatedAt: new Date(),
        },
      });

      console.log(`${toolLlmDocumentsToCalculate.length} tool documents have been calculated`);
    } else {
      console.log(`there is no initiative document to calculate`);
    }
  }

  public async ingestInitiatives(settings: Settings): Promise<void> {
    // Synchronizing properly for ingestion
    const initiativeLlmDocumentsToCalculate = await prisma.$transaction(
      async (tx) => {
        const initiatives = await tx.initiative.findMany({
          where: {
            origin: {
              deletedAt: null,
            },
          },
          include: {
            BusinessUseCasesOnInitiatives: {
              include: {
                businessUseCase: true,
              },
            },
            ToolsOnInitiatives: {
              include: {
                tool: true,
              },
            },
            InitiativeLlmDocument: true,
          },
          orderBy: [
            {
              name: 'asc',
            },
          ],
        });

        if (initiatives.length === 0) {
          throw new Error('it seems no initiative has been computed, which is required to export them to the llm system');
        }

        await tx.initiativeLlmDocument.deleteMany({
          where: {
            initiativeId: {
              notIn: initiatives.map((initiative) => initiative.id),
            },
          },
        });

        const initiativeDocumentsToCalculate: InitiativeLlmDocument[] = [];

        for (const initiative of initiatives) {
          const resultingDocumentContentObject = DocumentInitiativeTemplateSchema.parse({
            id: initiative.id,
            name: initiative.name,
            description: initiative.description,
            websites: initiative.websites,
            repositories: initiative.repositories,
            businessUseCases: initiative.BusinessUseCasesOnInitiatives.map((bucOnI) => bucOnI.businessUseCase.name),
            functionalUseCases: initiative.functionalUseCases,
            tools: initiative.ToolsOnInitiatives.map((toolOnI) => toolOnI.tool.name),
          });

          if (!!initiative.InitiativeLlmDocument) {
            // If the document has not been calculated since the last initive update, we make sure to update the content and mark it to be processed
            if (!initiative.InitiativeLlmDocument.calculatedAt || initiative.InitiativeLlmDocument.calculatedAt < initiative.updatedAt) {
              const updatedDocument = await tx.initiativeLlmDocument.update({
                where: {
                  initiativeId: initiative.id,
                },
                data: {
                  content: JSON.stringify(resultingDocumentContentObject),
                },
              });

              initiativeDocumentsToCalculate.push(updatedDocument);
            }
          } else {
            const createdDocument = await tx.initiativeLlmDocument.create({
              data: {
                initiativeId: initiative.id,
                content: JSON.stringify(resultingDocumentContentObject),
              },
            });

            initiativeDocumentsToCalculate.push(createdDocument);
          }
        }

        return initiativeDocumentsToCalculate;
      },
      {
        timeout: minutesToMilliseconds(process.env.NODE_ENV !== 'production' ? 20 : 5),
        isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted,
      }
    );

    if (initiativeLlmDocumentsToCalculate.length > 0) {
      // `addModels` always calculates the vector so we use it both for created documents and those to update
      // Note: this is out of the transaction because it could takes time to compute
      await this.initiativesVectorStore.addModels(initiativeLlmDocumentsToCalculate);

      await prisma.initiativeLlmDocument.updateMany({
        where: {
          id: {
            in: initiativeLlmDocumentsToCalculate.map((document) => document.id),
          },
        },
        data: {
          calculatedAt: new Date(),
        },
      });

      console.log(`${initiativeLlmDocumentsToCalculate.length} initiative documents have been calculated`);
    } else {
      console.log(`there is no initiative document to calculate`);
    }
  }

  public async computeInitiative(
    settings: Settings,
    projectDirectory: string,
    prompt: string,
    rawToolsFromAnalysis: string[]
  ): Promise<ResultSchemaType> {
    const promptCanvas = ChatPromptTemplate.fromMessages([
      [
        'system',
        `
You are a bot computing information to build an initiative sheet that will be listed in a directory. Use the tools from the context to give exact naming when answering questions about tooling.
---
CONTEXT:
{context}
---
`,
      ],
      ['human', '{input}'],
    ]);

    const chain = new LLMChain({
      llm: this.mistralaiClient,
      prompt: promptCanvas,
      verbose: false,
    });

    // To help the LLM we give inside the context tools we are looking for
    // Since we cannot give the 8k+ tools from our database, we try to provide a subset meaningful according to extracted tech references we retrieved
    const rawToolsVectors = await this.toolsVectorStore.embeddings.embedDocuments(rawToolsFromAnalysis.filter((item) => item.trim() !== ''));

    const contextTools: string[] = [];
    for (let i = 0; i < rawToolsVectors.length; i++) {
      watchGracefulExitInLoop();

      const similaries = await this.toolsVectorStore.similaritySearchVectorWithScore(rawToolsVectors[i], 1);
      assert(similaries.length > 0);

      // After some testing we evaluated having it under this value responds to our needs (tested on `['@mui/material', '@sentry/browser', 'next', 'mjml', 'crisp-sdk-web', '@gouvfr/dsfr', '@storybook/addon-notes']`)
      // In opposition to the final matching that must be accurate, here we want to give suggestions of tools according to dependency names that always include prefix, suffix, ... so we have a more flexible threshold
      if (similaries[0][1] < 0.25 && !contextTools.includes(similaries[0][0].pageContent)) {
        contextTools.push(similaries[0][0].pageContent);
      }
    }

    const invocationInputs: ChainValues = {
      input: prompt,
      context: contextTools.map((contextTool) => `- ${contextTool}`).join('\n'),
    };

    // Store the prompt for debug
    const contentToSend = await chain.prompt.format(invocationInputs);
    const gptPromptPath = path.resolve(projectDirectory, 'langchain-prompt.md');
    await fs.mkdir(path.dirname(gptPromptPath), { recursive: true });
    await fs.writeFile(gptPromptPath, contentToSend);

    const tokens = mistralTokenizer.encode(contentToSend);

    console.log(`the content to send is ${tokens.length} tokens long (${this.gptInstance.modelTokenLimit} is the input+output limit)`);

    if (tokens.length >= this.gptInstance.modelTokenLimit) {
      console.log('there are too many tokens for this GPT model to accept the current request');

      throw tokensReachTheLimitError;
    }

    let finishReason: string | null = null;
    let tokenUsage: TokenUsage | null = null;

    const answer = await chain.invoke(invocationInputs, {
      callbacks: [
        {
          handleLLMEnd: (output, runId, parentRunId?, tags?) => {
            if (!!output.generations[0]?.[0]?.generationInfo?.finish_reason) {
              finishReason = output.generations[0][0].generationInfo?.finish_reason;
            }

            if (!!output.llmOutput?.tokenUsage) {
              tokenUsage = output.llmOutput.tokenUsage as unknown as TokenUsage;
            }
          },
        },
      ],
    });

    if (finishReason !== 'stop') {
      throw new Error(`the generation has not completed fully according to the returned reason: ${finishReason}`);
    }

    assert(typeof answer.text === 'string');

    // For debug
    const gptAnswerPath = path.resolve(projectDirectory, 'gpt-answer.md');
    await fs.writeFile(gptAnswerPath, answer.text);

    if (tokenUsage !== null) {
      const usage = tokenUsage as TokenUsage; // TypeScript messes up due to the assignation being into `callbacks`, it tells it's `never` without casting

      assert(usage.totalTokens);

      console.log(
        `the GPT input and output represent ${usage.totalTokens} tokens in total (for a cost of ~$${
          (usage.totalTokens / 1000) * this.gptInstance.per1000TokensCost
        })`
      );

      if (usage.totalTokens > this.gptInstance.modelTokenLimit) {
        console.warn('it seemed to process more token than the limit, the content may be truncated and invalid');
        throw tokensReachTheLimitError;
      }
    }

    // With MistralAI the JSON will be between ```json and ``` delimiters so extracting them
    // We find a way for it to directly answer with JSON string by passing a TypeScript definition model
    // Before when passing a JSON model it tried to add a code block (```json and ```) with text around
    let jsonString: string | null = null;
    if (answer.text.includes('```json')) {
      jsonString = extractFirstJsonCodeContentFromMarkdown(answer.text);

      if (!jsonString) {
        console.log(answer.text);

        throw new Error(`the json code block is not present in the answer or the answer has been truncated while saying it's complete`);
      }
    }

    if (!jsonString) {
      jsonString = answer.text;
    }

    const answerObject = JSON.parse(jsonString);
    const result = ResultSchema.parse(answerObject);

    // We add correction to tools in case the LLM processed them poorly and to adjust to our own internal naming
    // Since embeddings are calculated by MistralAI we batch all at once to avoid API rate limiting
    const resultVectors = await this.toolsVectorStore.embeddings.embedDocuments(result.tools);

    for (let i = 0; i < result.tools.length; i++) {
      watchGracefulExitInLoop();

      let valueToKeep = result.tools[i];

      const similaries = await this.toolsVectorStore.similaritySearchVectorWithScore(resultVectors[i], 1);
      assert(similaries.length > 0);

      // After some testing we evaluated having it under this value responds to our needs
      if (similaries[0][1] < 0.05) {
        valueToKeep = similaries[0][0].pageContent;
      }

      result.tools[i] = valueToKeep;
    }

    return result;
  }

  public async assertToolsDocumentsAreReady(settings: Settings): Promise<void> {
    const total = await prisma.toolLlmDocument.count({});

    if (total === 0) {
      throw new Error('the tools documents must be ingested to be used by the llm system');
    }
  }

  public async requestAssistant(settings: Settings, sessionId: string, input: string, eventEmitter: ChunkEventEmitter): Promise<string> {
    z.string().uuid().parse(sessionId); // Make sure of the type since used as index

    // Create an history object if not existing for this session
    if (!this.sessions[sessionId]) {
      this.sessions[sessionId] = {
        history: new BufferMemory({
          inputKey: 'input',
          memoryKey: 'chat_history',
          returnMessages: true,
        }),
        lastRequestAt: new Date(),
        running: false,
      };
    } else {
      this.sessions[sessionId].lastRequestAt = new Date();
    }

    const session: Session = this.sessions[sessionId];
    try {
      if (session.running) {
        throw new Error(`this session is already being running, wait for it to finish before requesting the assistant again`);
      } else {
        session.running = true;
      }

      const promptCanvas = ChatPromptTemplate.fromMessages([
        [
          'system',
          `
You are a bot helping users finding the right initiative sheet from a directory. Note the directory is named Etabli and you are considered as its assistant. Use the provided sheets information from the context to answer the user questions, and in case you mention an initiative don't forget to give its link (with the format "${linkRegistry.get(
            'initiative',
            { initiativeId: '$INITIATIVE_ID' },
            { absolute: true }
          )}"). You should mention initiatives according to the user message, don't if it provides no information to search with. Just know that initiative represents a project or a product. You should answer in french except if the user speaks another language, and remember the user is not supposed to know some documents are set in your context.
---
CONTEXT:
{context}
---
`,
        ],
        new MessagesPlaceholder('chat_history'),
        ['human', '{input}'],
      ]);

      const combineDocsChain = await createStuffDocumentsChain({
        llm: this.mistralaiClient,
        prompt: promptCanvas,
        documentSeparator: '\n',
      });

      const chain = await createRetrievalChain({
        retriever: this.initiativesVectorStore.asRetriever(5),
        combineDocsChain: combineDocsChain,
      });

      // When using a stream there is no object `tokenUsage` as for the conventional way
      // So do our own logic (it should be exactly true but maybe there is a little variation with the calculation from the remote LLM)
      let totalTokensUsed = 0;

      const stream = await chain.stream(
        {
          chat_history: await session.history.chatHistory.getMessages(),
          input: input,
        },
        {
          configurable: {
            verbose: false,
          },
          callbacks: [
            {
              handleLLMStart: async (llm, messages) => {
                assert(messages.length === 1);

                const tokens = mistralTokenizer.encode(messages[0]);

                totalTokensUsed += tokens.length;
              },
              handleLLMEnd: async (output) => {
                if (!!output.generations[0]?.[0]) {
                  const tokens = mistralTokenizer.encode(output.generations[0][0].text);

                  totalTokensUsed += tokens.length;
                }
              },
            },
          ],
        }
      );

      let fullAnswer = '';
      for await (const chunk of stream) {
        // Note: for whatever reason the first ones are undefined despite the type (they are chunks with only `input`, then only `chat_history`, then only `content`, and after they are all answer message chunks)
        if (chunk.answer !== undefined) {
          fullAnswer += chunk.answer;

          // Notify the caller if it wants to use realtime display (the current function will return will the whole result once the stream is done)
          eventEmitter.emit('chunk', chunk.answer);
        }
      }

      assert(totalTokensUsed > 0); // Since we do our own calculation, if it's 0 that's really weird

      // We could debug token usage
      if (!!false) {
        console.log(
          `the GPT input and output represent ${totalTokensUsed} tokens in total (for a cost of ~$${
            (totalTokensUsed / 1000) * this.gptInstance.per1000TokensCost
          })`
        );

        if (totalTokensUsed > this.gptInstance.modelTokenLimit) {
          console.warn('it seemed to process more token than the limit, the content may be truncated and invalid');
          throw tokensReachTheLimitError;
        }
      }

      // Update history in case of a next invocation
      await session.history.chatHistory.addUserMessage(input);
      await session.history.chatHistory.addAIChatMessage(fullAnswer);

      // Truncate history for oldest messages to keep next call possible (and not too costly)
      // [WORKAROUND] The chat history messages are in a private property so impossible to filter them directly, so rebuilding the history
      const historyMessages = await session.history.chatHistory.getMessages();
      if (historyMessages.length > 20) {
        await session.history.chatHistory.clear();

        const messagesToKeep = historyMessages.slice(-20); // 20 last ones
        for (const messageToKeep of messagesToKeep) {
          await session.history.chatHistory.addMessage(messageToKeep);
        }
      }

      return fullAnswer;
    } finally {
      session.running = false;
    }
  }

  public async assertInitiativesDocumentsAreReady(settings: Settings): Promise<void> {
    const total = await prisma.initiativeLlmDocument.count({});

    if (total === 0) {
      throw new Error('the initiatives documents must be ingested to be used by the llm system');
    }
  }
}
