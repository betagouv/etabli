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
import jsonic from 'jsonic';
import { LLMChain } from 'langchain/chains';
import { createRetrievalChain } from 'langchain/chains/retrieval';
import { BufferMemory } from 'langchain/memory';
import mistralTokenizer from 'mistral-tokenizer-js';
import path from 'path';
import { z } from 'zod';

import { createStuffDocumentsChain } from '@etabli/src/features/custom-langchain/stuff';
import {
  ChunkEventEmitter,
  LlmManager,
  extractFirstJsonCodeContentFromMarkdown,
  extractFirstTypescriptCodeContentFromMarkdown,
} from '@etabli/src/features/llm';
import { gptInstances, gptSeed } from '@etabli/src/gpt';
import { DocumentInitiativeTemplateSchema, ResultSchema, ResultSchemaType } from '@etabli/src/gpt/template';
import { llmResponseFormatError, tokensReachTheLimitError } from '@etabli/src/models/entities/errors';
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

export interface QuerySession {
  vector: number[];
  lastRequestAt: Date;
}

export type QueryVectorHistory = {
  [key in string]: QuerySession;
};

export class LangchainWithLocalVectorStoreLlmManager implements LlmManager {
  public readonly mistralaiClient;
  public readonly toolsVectorStore;
  public readonly initiativesVectorStore;
  public readonly gptInstance = gptInstances['deprecatedMistralTiny'];
  public readonly sessions: Sessions = {}; // To not overcomplexify the logic we go with memory history considering just 1 instance of the product (or if more, with sticky IP to target the same instance for the same user)
  public readonly querySessions: QueryVectorHistory = {}; // To not overcomplexify the logic we go with memory history considering just 1 instance of the product (or if more, with sticky IP to target the same instance for the same user)
  public readonly cleanHistoryJob;

  public constructor() {
    this.mistralaiClient = new ChatMistralAI({
      apiKey: process.env.MISTRAL_API_KEY,
      modelName: this.gptInstance.model,
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
        initiativeId: true,
        content: PrismaVectorStore.ContentColumn,
      },
    });

    // We want to avoid memory leak due to conversations but also for data privacy (the UUID is not guessable, but we limit the risk)
    this.cleanHistoryJob = new CronJob(
      '0 * * * *', // Every hour
      () => {
        const sessionHistoryExpirationAt = subHours(new Date(), 6); // If a conversation has more than 6 hours, delete it
        const querySessionHistoryExpirationAt = subHours(new Date(), 1); // If a query has more than 1 hour, delete it

        for (let sessionId in this.sessions) {
          if (this.sessions[sessionId].lastRequestAt < sessionHistoryExpirationAt) {
            delete this.sessions[sessionId];
          }
        }

        for (let query in this.querySessions) {
          if (this.querySessions[query].lastRequestAt < querySessionHistoryExpirationAt) {
            delete this.querySessions[query];
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
          select: {
            id: true,
            name: true,
            updatedAt: true,
            ToolLlmDocument: {
              select: {
                calculatedAt: true,
              },
            },
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
      // Notes:
      // - this is out of the transaction because it could takes time to compute
      // - contrarly to `ingestInitiatives` calculating all tools together (< 5000 items) won't trigger the LLM tokens limit, so no need to chunk our API calls to MistralAI
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
          select: {
            id: true,
            name: true,
            description: true,
            websites: true,
            repositories: true,
            functionalUseCases: true,
            updatedAt: true,
            BusinessUseCasesOnInitiatives: {
              select: {
                businessUseCase: {
                  select: {
                    name: true,
                  },
                },
              },
            },
            ToolsOnInitiatives: {
              select: {
                tool: {
                  select: {
                    name: true,
                  },
                },
              },
            },
            InitiativeLlmDocument: {
              select: {
                calculatedAt: true,
              },
            },
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
      // Notes:
      // - this is out of the transaction because it could takes time to compute
      // - it has tokens limitation as for a basic chat call, so chunking the operation
      const documentsChunks: (typeof initiativeLlmDocumentsToCalculate)[0][][] = [[]];
      let currentChunk = 0;
      let currentChunkTokensCounter = 0;
      for (const initiativeLlmDocument of initiativeLlmDocumentsToCalculate) {
        const documentTokens = mistralTokenizer.encode(initiativeLlmDocument.content);

        // [IMPORTANT] Is a variable `str` is 10 tokens length, setting it inside an array `[str]` is still 10 tokens length
        // but after each new item will add a token, for example `[str, str]` is 21 tokens long
        // Note: below we do `+1` to take in account the pontentially added document
        const currentTokensFingerprintOfBatching = Math.max(documentsChunks[currentChunk].length - 1, 0);

        if (documentTokens.length >= this.gptInstance.modelTokenLimit) {
          throw new Error('an initiative document should not be huge and triggering the llm limit');
        } else if (currentChunkTokensCounter + documentTokens.length + (currentTokensFingerprintOfBatching + 1) >= this.gptInstance.modelTokenLimit) {
          // If adding this document to previous ones is over the tokens limit for, use a new chunk
          currentChunk += 1;
          documentsChunks.push([]);

          currentChunkTokensCounter = 0;
        }

        currentChunkTokensCounter += documentTokens.length;

        documentsChunks[currentChunk].push(initiativeLlmDocument);
      }

      for (const documentsChunk of documentsChunks) {
        await this.initiativesVectorStore.addModels(documentsChunk);

        await prisma.initiativeLlmDocument.updateMany({
          where: {
            id: {
              in: documentsChunk.map((document) => document.id),
            },
          },
          data: {
            calculatedAt: new Date(),
          },
        });

        await sleep(1000); // Wait to be sure not to trigger the API rate limit of MistralAI
      }

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
Tu es un robot qui compile des informations pour créer une fiche de projet/service qui sera listée dans un annuaire. Utilise les outils listés dans le contexte pour donner un nommage exact quand tu devras faire la correspondance avec les données que l'on te fournit.
---
CONTEXTE :
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

        console.error(`the json code block is not present in the answer or the answer has been truncated while saying it's complete`);

        throw llmResponseFormatError;
      }
    } else if (answer.text.includes('```ts')) {
      const typescriptCode = extractFirstTypescriptCodeContentFromMarkdown(answer.text);

      if (!typescriptCode) {
        console.log(answer.text);

        console.error(`the typescript code block is not present in the answer or the answer has been truncated while saying it's complete`);

        throw llmResponseFormatError;
      }

      // That's the pattern MistralAI seems to always provide when returning TypeScript format
      const jsonStringNotStrict = typescriptCode.replace('type ResultSchemaType =', '').trim();

      // A JSON object in TypeScript cannot be parsed due to missing quotes on properties, ending comma... so using a helper for this
      jsonString = jsonStringNotStrict;
    } else if (answer.text.includes('```')) {
      // Sometimes it forgets about the starting delimiter but has the one for the end, so we strip it
      jsonString = answer.text.replace('```', '');
    }

    if (!jsonString) {
      // Last attempt, hoping it has provided a pseudo-JSON we way parse
      jsonString = answer.text;
    }

    let answerObject: any;
    let result: ResultSchemaType;
    try {
      // To avoid issues with wrong syntax or missing wrapper delimiter, we use a library that may help in parsing the whole
      answerObject = jsonic(jsonString);
      result = ResultSchema.parse(answerObject);
    } catch (error) {
      console.log(`unable to parse the following content returned by the api`);
      console.log('------------');
      console.log(answer.text);
      console.log('------------');
      console.log(jsonString);
      console.log('------------');
      console.log(error);

      throw llmResponseFormatError;
    }

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

  public async getInitiativesFromQuery(query: string): Promise<string[]> {
    // [WORKAROUND] Force having the search as lowercase to get exact same results because the embeddings seem to be very sensitive to it
    // Even if it's only a manner of threshold with scoring, it's impossible to adjust correctly depending on uppercase/lowercase letters
    // For example:
    // - `Santé` is returning more items than `santé`
    // - `urban vitaliz`, `Urban Vitaliz` and `Urban vitaliz` are all the three not returning the same number of items
    query = query.toLowerCase();

    // Due to pagination it makes no sense to recompute the query embedding against the MistralAI API
    // so we keep a little cache just to reduce this cost
    if (!this.querySessions[query]) {
      const resultVector = await this.initiativesVectorStore.embeddings.embedQuery(query);

      this.querySessions[query] = {
        vector: resultVector,
        lastRequestAt: new Date(),
      };
    } else {
      this.querySessions[query].lastRequestAt = new Date();
    }

    const querySession = this.querySessions[query];

    // We restrict the search to 50 items to no overload the database, since people probably won't look for more without precising the search
    const similaries = await this.initiativesVectorStore.similaritySearchVectorWithScore(querySession.vector, 100);

    const filteredSimilaries = similaries.filter(([document, score]) => {
      return score < 0.3;
    });

    return filteredSimilaries.map(([document, score]) => {
      return document.metadata.initiativeId;
    });
  }

  public async assertToolsDocumentsAreReady(settings: Settings): Promise<void> {
    const total = await prisma.toolLlmDocument.count({
      where: {
        calculatedAt: {
          not: null,
        },
      },
    });

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
Tu es un robot qui aide les utilisateurs à trouver la bonne fiche d'initiative dans un annuaire (une initiative correspond à un projet/service). Sache que l'annuaire s'appelle Établi et que tu es considéré comme son assistant. Utilise les fiches fournies dans le contexte pour répondre aux questions de l'utilisateur, et si tu mentionnes une fiche d'une initiative n'oublie pas de donner son lien (avec le format "${linkRegistry.get(
            'initiative',
            { initiativeId: '$INITIATIVE_ID' },
            { absolute: true }
          )}"). Tu devrais fournir des fiches à propos du message de l'utilisateur, ne le fais pas s'il ne fournit aucune élément à rechercher. Tu dois répondre en français sauf si l'utilisateur parle une autre langue, et l'utilisateur ne doit pas savoir que tu as à dispotion un "CONTEXTE" qui t'est donné (ne parle jamais de "contexte" mais de résultats de recherche), il doit croire que tu as fait une recherche toi-même dans une base de données. Cite simplement les initiatives qui sont dans le contexte quand c'est approprié.
---
CONTEXTE :
{context}
---
`,
        ],
        new MessagesPlaceholder('chat_history'),
        ['human', '{input}'],
      ]);

      const totalDocumentsToRevealToTheUser: number = 5;

      const combineDocsChain = await createStuffDocumentsChain({
        llm: this.mistralaiClient,
        prompt: promptCanvas,
        documentSeparator: '\n',
        documentsMaximum: totalDocumentsToRevealToTheUser,
      });

      const chain = await createRetrievalChain({
        retriever: this.initiativesVectorStore.asRetriever(totalDocumentsToRevealToTheUser + 1),
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
    const total = await prisma.initiativeLlmDocument.count({
      where: {
        calculatedAt: {
          not: null,
        },
      },
    });

    if (total === 0) {
      throw new Error('the initiatives documents must be ingested to be used by the llm system');
    }
  }
}
