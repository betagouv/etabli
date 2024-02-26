import { FunctionalUseCase, Settings } from '@prisma/client';
import assert from 'assert';
import { minutesToMilliseconds } from 'date-fns/minutesToMilliseconds';
import { secondsToMilliseconds } from 'date-fns/secondsToMilliseconds';
import fsSync from 'fs';
import fs from 'fs/promises';
import handlebars from 'handlebars';
import OpenAI, { APIConnectionTimeoutError, toFile } from 'openai';
import { AssistantFile } from 'openai/resources/beta/assistants/files';
import { Run } from 'openai/resources/beta/threads/runs/runs';
import path from 'path';
import { encoding_for_model } from 'tiktoken';

import { ChunkEventEmitter, LlmManager } from '@etabli/src/features/llm';
import { gptInstances } from '@etabli/src/gpt';
import { DocumentInitiativeTemplateSchema, DocumentInitiativesChunkTemplateSchema, ResultSchema, ResultSchemaType } from '@etabli/src/gpt/template';
import { tokensReachTheLimitError } from '@etabli/src/models/entities/errors';
import { prisma } from '@etabli/src/prisma';
import { watchGracefulExitInLoop } from '@etabli/src/server/system';
import { sleep } from '@etabli/src/utils/sleep';

const __root_dirname = process.cwd();

export class OpenaiWithAssistantApiLlmManager implements LlmManager {
  public readonly openaiItemPrefix = 'etabli_';
  public readonly openaiBotAssistantName;
  public readonly openaiAnalyserAssistantName;
  public readonly openaiDocumentTokensLimit = 2000000;
  public readonly openaiDocumentsPerAssistantMaximum = 20;
  public readonly openaiClient;
  public readonly gptInstance = gptInstances['v3.5'];

  public constructor() {
    this.openaiBotAssistantName = this.formatTechnicalName('bot');
    this.openaiAnalyserAssistantName = this.formatTechnicalName('analyzer');

    this.openaiClient = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });
  }

  public async init() {
    let botAssistantId: string | null = null;
    let analyzerAssistantId: string | null = null;

    const initialPage = await this.openaiClient.beta.assistants.list({
      order: 'asc',
    });

    for await (const page of initialPage.iterPages()) {
      watchGracefulExitInLoop();

      for (const assistant of page.getPaginatedItems()) {
        if (assistant.name === this.openaiBotAssistantName) {
          botAssistantId = assistant.id;
        } else if (assistant.name === this.openaiAnalyserAssistantName) {
          analyzerAssistantId = assistant.id;
        }
      }
    }

    if (!botAssistantId) {
      const botAssistant = await this.openaiClient.beta.assistants.create({
        name: this.openaiBotAssistantName,
        model: this.gptInstance.model,
        instructions:
          'You are a bot to help retrieving the right initiative sheet into a directory. Use the provided sheets to answer questions and provide a link each time you mention one with the format "etabli://${INITIATIVE_ID}". And please address the user as the Etabli Assistant (Etabli being the directory of sheets mentionned before). Just know that initiative represents a project or a product.',
        tools: [
          {
            type: 'retrieval',
          },
        ],
      });

      console.log(`bot assistant created (${botAssistant.id})`);

      botAssistantId = botAssistant.id;
    }

    if (!analyzerAssistantId) {
      const analyzerAssistant = await this.openaiClient.beta.assistants.create({
        name: this.openaiAnalyserAssistantName,
        model: this.gptInstance.model,
        instructions:
          'You are a bot to help computing information to build an initiative sheet that will be listed in a directory. Use the provided tools to answer questions.',
        tools: [
          {
            type: 'retrieval',
          },
        ],
      });

      console.log(`analyzer assistant created (${analyzerAssistant.id})`);

      analyzerAssistantId = analyzerAssistant.id;
    }

    await prisma.settings.update({
      where: {
        onlyTrueAsId: true,
      },
      data: {
        llmBotAssistantId: botAssistantId,
        llmAnalyzerAssistantId: analyzerAssistantId,
        updateIngestedTools: false,
        updateIngestedInitiatives: false,
      },
    });
  }

  public async clean(): Promise<void> {
    const initialAssistantPage = await this.openaiClient.beta.assistants.list({
      order: 'asc',
    });

    for await (const page of initialAssistantPage.iterPages()) {
      watchGracefulExitInLoop();

      for (const assistant of page.getPaginatedItems()) {
        // In case the GPT account is used by multiple projects we only target those for this project
        if (assistant.name?.startsWith(this.openaiItemPrefix)) {
          await this.openaiClient.beta.assistants.del(assistant.id);

          console.log(`assistant deleted (${assistant.id})`);
        }
      }
    }

    // Remove all files that still exist despite no longer being attached to an assistant
    const initialFilePage = await this.openaiClient.files.list({});

    for await (const page of initialFilePage.iterPages()) {
      watchGracefulExitInLoop();

      for (const file of page.getPaginatedItems()) {
        // In case the GPT account is used by multiple projects we only target those for this project
        if (file.filename.startsWith(this.openaiItemPrefix)) {
          await this.openaiClient.files.del(file.id);

          console.log(`file deleted (${file.id})`);
        }
      }
    }

    // Also reset the database
    await prisma.settings.update({
      where: {
        onlyTrueAsId: true,
      },
      data: {
        llmBotAssistantId: null,
        llmAnalyzerAssistantId: null,
        initiativesBotAssistantFileIds: [],
        initiativesBotAssistantFilesUpdatedAt: null,
        updateIngestedInitiatives: false,
        toolsAnalyzerAssistantFileId: null,
        toolsAnalyzerAssistantFileUpdatedAt: null,
        updateIngestedTools: false,
      },
    });
  }

  public async startHistoryCleaner(): Promise<void> {
    throw new Error('not implemented yet');
  }

  public async stopHistoryCleaner(): Promise<void> {
    throw new Error('not implemented yet');
  }

  public async ingestTools(settings: Settings): Promise<void> {
    if (!settings.llmAnalyzerAssistantId) {
      throw new Error('the analyzer assistant must exist to compute initiative through the llm system');
    }

    const tools = await prisma.tool.findMany({
      orderBy: [
        {
          name: 'asc',
        },
      ],
    });

    if (tools.length === 0) {
      throw new Error('it seems you did not populate tools into the data, which is required to export them to the llm system');
    }

    const toolsNames: string[] = tools.map((tool) => tool.name);

    const toolsGptTemplateContent = await fs.readFile(path.resolve(__root_dirname, './src/gpt/templates/tools-document.md'), 'utf-8');
    const toolsGptTemplate = handlebars.compile(toolsGptTemplateContent);

    // Since tools should not reach limit of 2M tokens for 1 document, we have no chunk logic
    const toolsGptContent = toolsGptTemplate({ tools: toolsNames });

    // Make sure the content is valid
    const encoder = encoding_for_model(this.gptInstance.countModel);
    const tokens = encoder.encode(toolsGptContent);
    encoder.free();

    if (tokens.length > this.openaiDocumentTokensLimit) {
      throw new Error('the tools document is over the openai 2M tokens document limit, which is anormal');
    }

    // Store the document for debug
    const gptToolsDocumentPath = path.resolve(__root_dirname, './data/gpt-document-tools.md');
    await fs.mkdir(path.dirname(gptToolsDocumentPath), { recursive: true });
    await fs.writeFile(gptToolsDocumentPath, toolsGptContent);

    // Upload the document to GPT
    const file = await this.openaiClient.files.create({
      file: await toFile(Buffer.from(toolsGptContent), this.formatTechnicalName('tools')),
      purpose: 'assistants',
    });

    console.log(`the file has been uploaded to the llm system, now waiting for it to be fully processed and ready to use`);

    const finalStateFile = await this.openaiClient.files.waitForProcessing(file.id, {
      pollInterval: secondsToMilliseconds(5),
      maxWait: minutesToMilliseconds(1),
    });

    if (finalStateFile.status !== 'processed') {
      await this.openaiClient.files.del(finalStateFile.id);

      throw new Error(
        `the file has not be fully processed by the llm system (final status: ${finalStateFile.status}), we deleted it from their side`
      );
    }

    // Once processed we have to bind it to the analyzer assistant
    const assistantFile = await this.openaiClient.beta.assistants.files.create(settings.llmAnalyzerAssistantId, {
      file_id: finalStateFile.id,
    });

    // If there was a file before, we remove it since the new one is ready to use
    // Note: this is only possible because with this assistant we are far from reaching limits so both can live together on this short moment
    if (!!settings.toolsAnalyzerAssistantFileId) {
      await this.openaiClient.beta.assistants.files.del(settings.llmAnalyzerAssistantId, settings.toolsAnalyzerAssistantFileId);
      await this.openaiClient.files.del(settings.toolsAnalyzerAssistantFileId);
    }

    await prisma.settings.update({
      where: {
        onlyTrueAsId: true,
      },
      data: {
        toolsAnalyzerAssistantFileId: assistantFile.id,
        toolsAnalyzerAssistantFileUpdatedAt: new Date(),
        updateIngestedTools: false,
      },
    });

    console.log(`the new tools document is ready to use`);
  }

  public async ingestInitiatives(settings: Settings): Promise<void> {
    if (!settings.llmBotAssistantId) {
      throw new Error('the bot assistant must exist to feed the llm system for users searches');
    }

    const initiatives = await prisma.initiative.findMany({
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

    const initiativesChunkGptTemplateContent = await fs.readFile(
      path.resolve(__root_dirname, './src/gpt/templates/initiatives-chunk-document.md'),
      'utf-8'
    );
    const initiativesChunkGptTemplate = handlebars.compile(initiativesChunkGptTemplateContent);
    const initiativeGptTemplateContent = await fs.readFile(
      path.resolve(__root_dirname, './src/gpt/templates/initiatives-chunk-document-initiative.md'),
      'utf-8'
    );
    const initiativeGptTemplate = handlebars.compile(initiativeGptTemplateContent);

    // Since our bot assistant is limited to 20 files, and for each 2M tokens maximum
    // we have to make our own calculation to chunk the whole properly
    // Note: we do approximation about the tokens length because we concatenate files and it maybe vary, that's why we use a limit with margin
    const pessimistTokensMaximum = Math.floor(0.98 * this.openaiDocumentTokensLimit);

    const emptyChunkHeaderContent = initiativesChunkGptTemplate(
      DocumentInitiativesChunkTemplateSchema.parse({
        currentChunkNumber: 0,
        chunksTotal: 0,
        formattedInitiatives: [],
      })
    );

    const encoder = encoding_for_model(this.gptInstance.countModel);
    const tokens = encoder.encode(emptyChunkHeaderContent);
    encoder.free();

    const approximativeHeaderTokensLength = tokens.length;

    let formattedInitiativesPerChunk: string[][] = [[]];
    let currentChunk = 1;
    let currentChunkTokensLength = approximativeHeaderTokensLength;
    for (const initiative of initiatives) {
      watchGracefulExitInLoop();

      const formattedInitiativeContent = initiativeGptTemplate(
        DocumentInitiativeTemplateSchema.parse({
          id: initiative.id,
          name: initiative.name,
          description: initiative.description,
          websites: initiative.websites.length > 0 ? initiative.websites : null,
          repositories: initiative.repositories.length > 0 ? initiative.repositories : null,
          businessUseCases:
            initiative.BusinessUseCasesOnInitiatives.length > 0
              ? initiative.BusinessUseCasesOnInitiatives.map((bucOnI) => bucOnI.businessUseCase.name)
              : null,
          functionalUseCases:
            initiative.functionalUseCases.length > 0
              ? initiative.functionalUseCases.map((functionalUseCase) => {
                  // This is formatting stuff and may end into a i18n when set up
                  switch (functionalUseCase) {
                    case FunctionalUseCase.GENERATES_PDF:
                      return 'generate PDF documents';
                    case FunctionalUseCase.HAS_VIRTUAL_EMAIL_INBOXES:
                      return 'create virtual email inboxes';
                    case FunctionalUseCase.SENDS_EMAILS:
                      return 'send emails';
                    default:
                      throw new Error(`text transformation is not implemented for the function use case "${functionalUseCase}"`);
                  }
                })
              : null,
          tools: initiative.ToolsOnInitiatives.length > 0 ? initiative.ToolsOnInitiatives.map((toolOnI) => toolOnI.tool.name) : null,
        })
      );

      const encoder = encoding_for_model(this.gptInstance.countModel);
      const tokens = encoder.encode(formattedInitiativeContent);
      encoder.free();

      currentChunkTokensLength += tokens.length;

      // If with this new initative we are above limits, put it onto the next chunk
      if (currentChunkTokensLength > pessimistTokensMaximum) {
        console.log('starting a new chunk calculation');

        currentChunk += 1;
        formattedInitiativesPerChunk.push([]);

        if (currentChunk > this.openaiDocumentsPerAssistantMaximum) {
          throw new Error(`we cannot format more than ${this.openaiDocumentsPerAssistantMaximum} files for `);
        }
      }

      formattedInitiativesPerChunk[currentChunk - 1].push(formattedInitiativeContent);
    }

    const gptInitiativeChunksDocumentsFolderPath = path.resolve(__root_dirname, './data/gpt-document-initiatives');

    // Remove previous debug files if any
    if (fsSync.existsSync(gptInitiativeChunksDocumentsFolderPath)) {
      await fs.rm(gptInitiativeChunksDocumentsFolderPath, { recursive: true, force: true });
    }

    await fs.mkdir(gptInitiativeChunksDocumentsFolderPath);

    // We know about the future total of chunks now, let's format them
    const chunks: string[] = [];
    for (let i = 0; i < formattedInitiativesPerChunk.length; i++) {
      const chunkNumber = i + 1;

      const chunkContent = initiativesChunkGptTemplate(
        DocumentInitiativesChunkTemplateSchema.parse({
          currentChunkNumber: chunkNumber,
          chunksTotal: formattedInitiativesPerChunk.length,
          formattedInitiatives: formattedInitiativesPerChunk[i],
        })
      );

      // Store the document for debug
      const gptInitiativesChunkDocumentPath = path.resolve(
        gptInitiativeChunksDocumentsFolderPath,
        `gpt-document-initiatives-chunk-${chunkNumber}.md`
      );
      await fs.writeFile(gptInitiativesChunkDocumentPath, chunkContent);

      // We delay uploading to GPT to be sure the whole can be formatted (to not mess with remote storage)
      chunks.push(chunkContent);
    }

    // Upload to GPT all files
    const filesIds: string[] = [];
    for (let i = 0; i < chunks.length; i++) {
      const chunkNumber = i + 1;

      const file = await this.openaiClient.files.create({
        file: await toFile(Buffer.from(chunks[i]), this.formatTechnicalName(`initiatives_chunk_${chunkNumber}`)),
        purpose: 'assistants',
      });

      filesIds.push(file.id);
    }

    console.log(`the files have been uploaded to the llm system, now waiting for them to be fully processed and ready to use`);

    // Wait for all to be processed (since this step can take time we made sure to upload all first)
    const finalStateFiles = await Promise.all(
      filesIds.map((fileId) => {
        return this.openaiClient.files.waitForProcessing(fileId, {
          pollInterval: secondsToMilliseconds(5),
          maxWait: minutesToMilliseconds(1),
        });
      })
    );

    // If any has failed, we cancel the whole process
    if (finalStateFiles.some((file) => file.status !== 'processed')) {
      for (const finalStateFile of finalStateFiles) {
        await this.openaiClient.files.del(finalStateFile.id);
      }

      throw new Error(`at least a file has not be fully processed by the llm system, we deleted all of them from their side`);
    }

    // Since according to our estimation our own dataset will probably use around the maximum of allowed files for this assitant
    // we need to first unbind previous files before adding the new ones (it's a bit more risky in case of a failure, but we have no other choice)
    for (const previousFileId of settings.initiativesBotAssistantFileIds) {
      await this.openaiClient.beta.assistants.files.del(settings.llmBotAssistantId, previousFileId);
      await this.openaiClient.files.del(previousFileId);
    }

    const assistantFiles: AssistantFile[] = [];
    for (const finalStateFile of finalStateFiles) {
      const assistantFile = await this.openaiClient.beta.assistants.files.create(settings.llmBotAssistantId, {
        file_id: finalStateFile.id,
      });

      assistantFiles.push(assistantFile);
    }

    await prisma.settings.update({
      where: {
        onlyTrueAsId: true,
      },
      data: {
        initiativesBotAssistantFileIds: assistantFiles.map((assistantFile) => assistantFile.id),
        initiativesBotAssistantFilesUpdatedAt: new Date(),
        updateIngestedInitiatives: false,
      },
    });

    console.log(`the new initiatives documents are ready to use`);
  }

  public async computeInitiative(
    settings: Settings,
    projectDirectory: string,
    prompt: string,
    rawToolsFromAnalysis: string[]
  ): Promise<ResultSchemaType> {
    // Make sure the content is valid
    const encoder = encoding_for_model(this.gptInstance.countModel);
    const tokens = encoder.encode(prompt);
    encoder.free();

    console.log(`the content to send is ${tokens.length} tokens long (${this.gptInstance.modelTokenLimit} is the input+output limit)`);

    if (tokens.length >= this.gptInstance.modelTokenLimit) {
      console.log('there are too many tokens for this GPT model to accept the current request');

      throw tokensReachTheLimitError;
    }

    // Store the prompt for debug
    const gptPromptPath = path.resolve(projectDirectory, 'gpt-prompt.md');
    await fs.writeFile(gptPromptPath, prompt);

    assert(settings.llmAnalyzerAssistantId);

    // Process data
    const run = await this.openaiClient.beta.threads.createAndRun({
      assistant_id: settings.llmAnalyzerAssistantId,
      thread: {
        messages: [
          {
            role: 'user',
            content: prompt,
          },
        ],
      },
      // [IMPORTANT] With GPT version without Assistant (needed for files) we were able to specify deterministic parameters, but they are no longer available in the beta version of Assistant...
      // TODO: enable them once they are released (if they are)
      // ---
      // response_format: {
      //   type: 'json_object',
      // },
      // temperature: 0, // Less creative answer, more deterministic
      // top_p: 0.1,
      // seed: gptSeed, // Cannot guarantee exact same answers for the same prompt, but should help (`system_fingerprint` can also be watched to detect a system change on their side)
    });

    const finalStateRun = await this.waitForRunProcessing(run, {
      pollInterval: secondsToMilliseconds(3),
      maxWait: minutesToMilliseconds(1),
    });

    if (finalStateRun.status !== 'completed') {
      throw new Error(`the run has not be fully completed by the llm system (final status: ${finalStateRun.status}), stopping the whole`);
    }

    if (run.usage) {
      console.log(
        `the GPT input and output represent ${run.usage.total_tokens} tokens in total (for a cost of ~$${
          (run.usage.total_tokens / 1000) * this.gptInstance.per1000TokensCost
        })`
      );

      if (run.usage.total_tokens > this.gptInstance.modelTokenLimit) {
        console.warn('it seemed to process more token than the limit, the content may be truncated and invalid');

        throw tokensReachTheLimitError;
      }
    }

    const messages = await this.openaiClient.beta.threads.messages.list(run.thread_id, { order: 'desc', limit: 1 });
    const answer = messages.data[0];

    if (answer.content.length !== 1 || answer.content[0].type !== 'text') {
      throw new Error('GPT result should send only 1 textual answer');
    }

    const textPart = answer.content[0].text;

    for (const annotation of textPart.annotations) {
      console.log(annotation);

      throw new Error(`our system is not expecting annotation but in case it GPT evolves we want to be warned`);
    }

    const answerObject = JSON.parse(textPart.value);

    return ResultSchema.parse(answerObject);
  }

  public async assertToolsDocumentsAreReady(settings: Settings): Promise<void> {
    if (!settings.llmAnalyzerAssistantId) {
      throw new Error('the analyzer assistant must exist to compute initiative through the llm system');
    } else if (!settings.toolsAnalyzerAssistantFileId) {
      throw new Error('the analyzer assistant must have its knowledge base set up');
    }
  }

  public async requestAssistant(settings: Settings, sessionId: string, input: string, eventEmitter: ChunkEventEmitter): Promise<string> {
    throw new Error('not implemented yet');
  }

  public async assertInitiativesDocumentsAreReady(settings: Settings): Promise<void> {
    if (!settings.llmBotAssistantId) {
      throw new Error('the bot assistant must exist to feed the llm system for users searches');
    } else if (settings.initiativesBotAssistantFileIds.length === 0) {
      throw new Error('the bot assistant must have its knowledge base set up');
    }
  }

  // This is inspired from their `waitForProcessing` for file processing
  protected async waitForRunProcessing(
    run: Run,
    { pollInterval = 5000, maxWait = 30 * 60 * 1000 }: { pollInterval?: number; maxWait?: number } = {}
  ): Promise<Run> {
    const TERMINAL_STATES = new Set(['requires_action', 'cancelled', 'failed', 'completed', 'expired']);

    const start = Date.now();
    let tmpRun = await this.openaiClient.beta.threads.runs.retrieve(run.thread_id, run.id);

    while (!tmpRun.status || !TERMINAL_STATES.has(tmpRun.status)) {
      await sleep(pollInterval);

      tmpRun = await this.openaiClient.beta.threads.runs.retrieve(run.thread_id, run.id);
      if (Date.now() - start > maxWait) {
        throw new APIConnectionTimeoutError({
          message: `Giving up on waiting for run ${run.id} to finish processing after ${maxWait} milliseconds.`,
        });
      }
    }

    return tmpRun;
  }

  protected formatTechnicalName(input: string): string {
    return `${this.openaiItemPrefix}${input}`;
  }
}
