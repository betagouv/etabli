import { minutesToMilliseconds } from 'date-fns/minutesToMilliseconds';
import { secondsToMilliseconds } from 'date-fns/secondsToMilliseconds';
import fs from 'fs/promises';
import handlebars from 'handlebars';
import OpenAI, { toFile } from 'openai';
import path from 'path';
import { encoding_for_model } from 'tiktoken';

import { initSettingsIfNeeded } from '@etabli/features/settings';
import { gptInstances } from '@etabli/gpt';
import { prisma } from '@etabli/prisma';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const gptInstance = gptInstances['v3.5'];

export const openaiItemPrefix = 'etabli_';
export const openaiBotAssistantName = `${openaiItemPrefix}bot`;
export const openaiAnalyserAssistantName = `${openaiItemPrefix}analyzer`;
export const openaiDocumentTokensLimit = 2000000;
export const openaiDocumentsPerAssistantMaximum = 20;

export async function initLlmSystem() {
  // Note: Prisma does not implement yet locking table though it should help not messing with requesting the LLM system while replacing sensitive components of it
  // This race condition should remain rare and having error thrown should be fine since replayed on the next iteration

  await initSettingsIfNeeded();

  let botAssistantId: string | null = null;
  let analyzerAssistantId: string | null = null;

  const initialPage = await openai.beta.assistants.list({
    order: 'asc',
  });

  for await (const page of initialPage.iterPages()) {
    for (const assistant of page.getPaginatedItems()) {
      if (assistant.name === openaiBotAssistantName) {
        botAssistantId = assistant.id;
      } else if (assistant.name === openaiAnalyserAssistantName) {
        analyzerAssistantId = assistant.id;
      }
    }
  }

  if (!botAssistantId) {
    const botAssistant = await openai.beta.assistants.create({
      name: openaiBotAssistantName,
      model: gptInstance.model,
      instructions:
        'You are a bot to help retrieving the right initiative sheet into a directory. Use the provided sheets to answer questions. And please address the user as the Etabli Assistant (Etabli being the directory of sheets mentionned before)',
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
    const analyzerAssistant = await openai.beta.assistants.create({
      name: openaiBotAssistantName,
      model: gptInstance.model,
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
      updateToolsAnalyzerAssistantFile: false,
      updateInitiativesBotAssistantFiles: false,
    },
  });
}

export async function cleanLlmSystem() {
  // Note: Prisma does not implement yet locking table though should help not messing with requesting the LLM system while replacing sensitive components of it
  // This race condition should remain rare and having error thrown should be fine since replayed on the next iteration

  const initialAssistantPage = await openai.beta.assistants.list({
    order: 'asc',
  });

  for await (const page of initialAssistantPage.iterPages()) {
    for (const assistant of page.getPaginatedItems()) {
      // In case the GPT account is used by multiple projects we only target those for this project
      if (assistant.name?.startsWith(openaiItemPrefix)) {
        await openai.beta.assistants.del(assistant.id);

        console.log(`assistant deleted (${assistant.id})`);
      }
    }
  }

  // Remove all files that still exist despite no longer being attached to an assistant
  const initialFilePage = await openai.files.list({});

  for await (const page of initialFilePage.iterPages()) {
    for (const file of page.getPaginatedItems()) {
      // In case the GPT account is used by multiple projects we only target those for this project
      if (file.filename.startsWith(openaiItemPrefix)) {
        await openai.files.del(file.id);

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
      updateInitiativesBotAssistantFiles: false,
      toolsAnalyzerAssistantFileId: null,
      toolsAnalyzerAssistantFileUpdatedAt: null,
      updateToolsAnalyzerAssistantFile: false,
    },
  });
}

export async function exportToolListToLlmSystem() {
  // Since we don't want to send all tools at each request to GPT (because it would be costly but also would reduce the token capacity)
  // We send them as a document so GPT can index them so they can be used as knowledge

  // Note: Prisma does not implement yet locking table though it should help not messing with requesting the LLM system while replacing sensitive components of it
  // This race condition should remain rare and having error thrown should be fine since replayed on the next iteration
  const settings = await prisma.settings.findUniqueOrThrow({
    where: {
      onlyTrueAsId: true,
    },
  });

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

  const toolsGptTemplateContent = await fs.readFile(path.resolve(__dirname, '../../src/gpt/templates/tools-document.md'), 'utf-8');
  const toolsGptTemplate = handlebars.compile(toolsGptTemplateContent);

  // Since tools should not reach limit of 2M tokens for 1 document, we have no chunk logic
  const toolsGptContent = toolsGptTemplate({ tools: toolsNames });

  // Make sure the content is valid
  const encoder = encoding_for_model(gptInstance.countModel);
  const tokens = encoder.encode(toolsGptContent);
  encoder.free();

  if (tokens.length > openaiDocumentTokensLimit) {
    throw new Error('the tools document is over the openai 2M tokens document limit, which is anormal');
  }

  // Store the document for debug
  const gptToolsDocumentPath = path.resolve(__dirname, '../../data/gpt-document-tools.md');
  await fs.writeFile(gptToolsDocumentPath, toolsGptContent);

  // Upload the document to GPT
  const file = await openai.files.create({
    file: await toFile(Buffer.from(toolsGptContent), `${openaiItemPrefix}_tools`),
    purpose: 'assistants',
  });

  console.log(`the file has been uploaded to the llm system, now waiting for it to be fully processed and ready to use`);

  const finalStateFile = await openai.files.waitForProcessing(file.id, {
    pollInterval: secondsToMilliseconds(5),
    maxWait: minutesToMilliseconds(1),
  });

  if (finalStateFile.status !== 'processed') {
    await openai.files.del(finalStateFile.id);

    throw new Error(`the file has not be fully processed by the llm system (final status: ${finalStateFile.status}), we deleted it from their side`);
  }

  // Once processed we have to bind it to the analyzer assistant
  const assistantFile = await openai.beta.assistants.files.create(settings.llmAnalyzerAssistantId, {
    file_id: finalStateFile.id,
  });

  // If there was a file before, we remove it since the new one is ready to use
  // Note: this is only possible because with this assistant we are far from reaching limits so both can live together on this short moment
  if (!!settings.toolsAnalyzerAssistantFileId) {
    await openai.beta.assistants.files.del(settings.llmAnalyzerAssistantId, settings.toolsAnalyzerAssistantFileId);
  }

  await prisma.settings.update({
    where: {
      onlyTrueAsId: true,
    },
    data: {
      toolsAnalyzerAssistantFileId: assistantFile.id,
      toolsAnalyzerAssistantFileUpdatedAt: new Date(),
      updateToolsAnalyzerAssistantFile: false,
    },
  });
}
