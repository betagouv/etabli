import { PrismaVectorStore } from '@langchain/community/vectorstores/prisma';
import { TokenUsage } from '@langchain/core/language_models/base';
import { ChatPromptTemplate, MessagesPlaceholder } from '@langchain/core/prompts';
import { ChainValues } from '@langchain/core/utils/types';
import { ChatMistralAI, MistralAIEmbeddings } from '@langchain/mistralai';
import { InitiativeLlmDocument, Prisma, Settings, ToolLlmDocument } from '@prisma/client';
import assert from 'assert';
import fs from 'fs/promises';
import { LLMChain } from 'langchain/chains';
import { createStuffDocumentsChain } from 'langchain/chains/combine_documents';
import { createRetrievalChain } from 'langchain/chains/retrieval';
import { BufferMemory } from 'langchain/memory';
import mistralTokenizer from 'mistral-tokenizer-js';
import path from 'path';

import { LlmManager, extractFirstJsonCodeContentFromMarkdown } from '@etabli/features/llm';
import { gptInstances, gptSeed } from '@etabli/gpt';
import { DocumentInitiativeTemplateSchema, ResultSchema, ResultSchemaType } from '@etabli/gpt/template';
import { tokensReachTheLimitError } from '@etabli/models/entities/errors';
import { prisma } from '@etabli/prisma';
import { sleep } from '@etabli/utils/sleep';

export class LangchainWithLocalVectorStoreLlmManager implements LlmManager {
  public readonly mistralaiClient;
  public readonly toolsVectorStore;
  public readonly initiativesVectorStore;
  public readonly gptInstance = gptInstances['tiny'];
  // TODO: object of memory by sessionId, clean them at each new chat message (look for those expired)

  public readonly chatPromptMemory = new BufferMemory({
    inputKey: 'input',
    memoryKey: 'chat_history',
    returnMessages: true,
  });

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

  public async ingestTools(settings: Settings): Promise<void> {
    // Insert needed data
    // TODO: manage updates of content... based on tool.id?
    const toolLlmDocuments = await prisma.$transaction(
      async (tx) => {
        const tools = await tx.tool.findMany({
          orderBy: [
            {
              name: 'asc',
            },
          ],
        });

        if (tools.length === 0) {
          throw new Error('it seems you did not populate tools into the data, which is required to export them to the llm system');
        }

        return Promise.all(
          tools.map(async (tool) => {
            return await tx.toolLlmDocument.create({
              select: {
                id: true,
                content: true,
                toolId: true,
              },
              data: { content: tool.name, toolId: tool.id },
            });
          })
        );
      },
      {
        timeout: 1 * 60 * 1000,
        isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted,
      }
    );

    await this.toolsVectorStore.addModels(toolLlmDocuments);
  }

  public async ingestInitiatives(settings: Settings): Promise<void> {
    // Insert needed data
    // TODO: manage updates of content... based on initiative.id?
    const initiativeLlmDocuments = await prisma.$transaction(
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

        return Promise.all(
          initiatives.map(async (initiative) => {
            return await tx.initiativeLlmDocument.create({
              select: {
                id: true,
                content: true,
                initiativeId: true,
              },
              data: {
                content: JSON.stringify(
                  DocumentInitiativeTemplateSchema.parse({
                    id: initiative.id,
                    name: initiative.name,
                    description: initiative.description,
                    websites: initiative.websites,
                    repositories: initiative.repositories,
                    businessUseCases: initiative.BusinessUseCasesOnInitiatives.map((bucOnI) => bucOnI.businessUseCase.name),
                    functionalUseCases: initiative.functionalUseCases,
                    tools: initiative.ToolsOnInitiatives.map((toolOnI) => toolOnI.tool.name),
                  })
                ),
                initiativeId: initiative.id,
              },
            });
          })
        );
      },
      {
        timeout: 1 * 60 * 1000,
        isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted,
      }
    );

    await this.initiativesVectorStore.addModels(initiativeLlmDocuments);
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
    await sleep(500);

    const contextTools: string[] = [];
    for (let i = 0; i < rawToolsVectors.length; i++) {
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
    await sleep(500);
    const resultVectors = await this.toolsVectorStore.embeddings.embedDocuments(result.tools);

    for (let i = 0; i < result.tools.length; i++) {
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

  public async requestAssistant(settings: Settings, sessionId: string, input: string): Promise<string> {
    const promptCanvas = ChatPromptTemplate.fromMessages([
      [
        'system',
        `
You are a bot helping users finding the right initiative sheet from a directory. Note the directory is named Etabli and you are considered as its assistant. Use the provided sheets information from the context to answer the user questions, and in case you mention an initiative don't forget to give its link (with the format "etabli://$INITIATIVE_ID"). You should mention initiatives according to the user message, don't if it provides no information to search with. Just know that initiative represents a project or a product. Adapt your answers to the user language and remember the user is not supposed to know some documents are set in your context.
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

    let finishReason: string | null = null;
    let tokenUsage: TokenUsage | null = null;

    const result = await chain.invoke(
      {
        chat_history: await this.chatPromptMemory.chatHistory.getMessages(),
        input: input,
      },
      {
        configurable: {
          verbose: false,
        },
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
      }
    );

    if (finishReason !== 'stop') {
      throw new Error(`the generation has not completed fully according to the returned reason: ${finishReason}`);
    }

    // We could debug token usage
    if (!!false && tokenUsage !== null) {
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

    // Update history in case of a next invocation
    await this.chatPromptMemory.chatHistory.addUserMessage(input);
    await this.chatPromptMemory.chatHistory.addAIChatMessage(result.answer);

    return result.answer;
  }

  public async assertInitiativesDocumentsAreReady(settings: Settings): Promise<void> {
    const total = await prisma.initiativeLlmDocument.count({});

    if (total === 0) {
      throw new Error('the initiatives documents must be ingested to be used by the llm system');
    }
  }
}