import { PrismaVectorStore } from '@langchain/community/vectorstores/prisma';
import { TokenUsage } from '@langchain/core/language_models/base';
import { ChatPromptTemplate } from '@langchain/core/prompts';
import { ChainValues } from '@langchain/core/utils/types';
import { ChatMistralAI, MistralAIEmbeddings } from '@langchain/mistralai';
import { InitiativeLlmDocument, Prisma, Settings, ToolLlmDocument } from '@prisma/client';
import assert from 'assert';
import fs from 'fs/promises';
import { LLMChain } from 'langchain/chains';
import mistralTokenizer from 'mistral-tokenizer-js';
import path from 'path';

import { LlmManager, extractFirstJsonCodeContentFromMarkdown } from '@etabli/features/llm';
import { gptInstances, gptSeed } from '@etabli/gpt';
import { ResultSchema, ResultSchemaType } from '@etabli/gpt/template';
import { tokensReachTheLimitError } from '@etabli/models/entities/errors';
import { prisma } from '@etabli/prisma';

export class LangchainWithLocalVectorStoreLlmManager implements LlmManager {
  public readonly mistralaiClient;
  public readonly toolsVectorStore;
  public readonly initiativesVectorStore;
  public readonly gptInstance = gptInstances['small'];
  // TODO: object of memory by sessionId, clean them at each new chat message (look for those expired)

  public constructor() {
    this.mistralaiClient = new ChatMistralAI({
      apiKey: process.env.MISTRAL_API_KEY,
      modelName: 'mistral-small',
      temperature: 0, // Less creative answer, more deterministic
      streaming: false,
      topP: 1,
      // maxTokens: null, // Disabled by default but the typing "null" is not supported despite in the documentation
      safeMode: false,
      randomSeed: gptSeed,
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
              data: { content: initiative.name, initiativeId: initiative.id },
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
    const sessionId = 'chat_history'; // TODO: change in the future when managing real chat with multiple users

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

    const contextPotentielCorrespondingTools = await this.toolsVectorStore.similaritySearch(rawToolsFromAnalysis.join('\n'), 100); // Most of initative won't have more than 30 well-known tools so it should be fine to the bot make the matching without using too many tokens

    const invocationInputs: ChainValues = {
      input: prompt,
      context: contextPotentielCorrespondingTools.map((contextTool) => `- ${contextTool.metadata.content}`).join('\n'),
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

    // TODO: for whatever reason it somtimes puts sentences around the JSON whereas we asked it in the prompt to not do this
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

    return ResultSchema.parse(answerObject);
  }

  public async assertToolsDocumentsAreReady(settings: Settings): Promise<void> {
    const total = await prisma.toolLlmDocument.count({});

    if (total === 0) {
      throw new Error('the tools documents must be ingested to be used by the llm system');
    }
  }
}
