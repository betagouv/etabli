import { Settings } from '@prisma/client';

import { LangchainWithLocalVectorStoreLlmManager } from '@etabli/features/llm-langchain';
import { OpenaiWithAssistantApiLlmManager } from '@etabli/features/llm-openai';
import { initSettingsIfNeeded } from '@etabli/features/settings';
import { ResultSchemaType } from '@etabli/gpt/template';
import { prisma } from '@etabli/prisma';

export interface LlmManager {
  init(): Promise<void>;
  clean(): Promise<void>;
  ingestTools(settings: Settings): Promise<void>;
  ingestInitiatives(settings: Settings): Promise<void>;
  computeInitiative(settings: Settings, projectDirectory: string, prompt: string): Promise<ResultSchemaType>;
}

export const llmManagerInstance = !!true ? new OpenaiWithAssistantApiLlmManager() : new LangchainWithLocalVectorStoreLlmManager();

export async function initLlmSystem() {
  // Note: Prisma does not implement yet locking table though it should help not messing with requesting the LLM system while replacing sensitive components of it
  // This race condition should remain rare and having error thrown should be fine since replayed on the next iteration

  await initSettingsIfNeeded();

  await llmManagerInstance.init();
}

export async function cleanLlmSystem() {
  // Note: Prisma does not implement yet locking table though should help not messing with requesting the LLM system while replacing sensitive components of it
  // This race condition should remain rare and having error thrown should be fine since replayed on the next iteration

  await llmManagerInstance.clean();
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

  await llmManagerInstance.ingestTools(settings);
}

export async function exportInitiativeListToLlmSystem() {
  // The user assistant helping finding initiatives needs to have this knowledge base
  // We send all initiatives grouped into chunked documents so GPT can index them so they can be used as knowledge

  // Note: Prisma does not implement yet locking table though it should help not messing with requesting the LLM system while replacing sensitive components of it
  // This race condition should remain rare and having error thrown should be fine since replayed on the next iteration
  const settings = await prisma.settings.findUniqueOrThrow({
    where: {
      onlyTrueAsId: true,
    },
  });

  await llmManagerInstance.ingestInitiatives(settings);
}
