import { Settings } from '@prisma/client';

import { LlmManager } from '@etabli/features/llm';
import { ResultSchema, ResultSchemaType } from '@etabli/gpt/template';

export class LangchainWithLocalVectorStoreLlmManager implements LlmManager {
  public constructor() {}

  public async init() {}

  public async clean(): Promise<void> {}

  public async ingestTools(settings: Settings): Promise<void> {}

  public async ingestInitiatives(settings: Settings): Promise<void> {}

  public async computeInitiative(settings: Settings, projectDirectory: string, prompt: string): Promise<ResultSchemaType> {
    return ResultSchema.parse({});
  }
}
