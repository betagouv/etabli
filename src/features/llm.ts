import OpenAI from 'openai';

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
    },
  });
}

export async function cleanLlmSystem() {
  // Note: Prisma does not implement yet locking table though should help not messing with requesting the LLM system while replacing sensitive components of it
  // This race condition should remain rare and having error thrown should be fine since replayed on the next iteration

  const initialPage = await openai.beta.assistants.list({
    order: 'asc',
  });

  for await (const page of initialPage.iterPages()) {
    for (const assistant of page.getPaginatedItems()) {
      // In case the GPT account is used by multiple assistants we only target those for this project
      if (assistant.name?.startsWith(openaiItemPrefix)) {
        await openai.beta.assistants.del(assistant.id);

        console.log(`assistant deleted (${assistant.id})`);
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
    },
  });
}
