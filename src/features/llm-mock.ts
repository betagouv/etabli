import { Settings } from '@prisma/client';

import { ChunkEventEmitter, LlmManager } from '@etabli/src/features/llm';
import { ResultSchema, ResultSchemaType } from '@etabli/src/gpt/template';
import { sleep } from '@etabli/src/utils/sleep';

export class MockVectorStoreLlmManager implements LlmManager {
  public constructor() {}

  public async init() {
    console.log('the llm manager mock is being used');
  }

  public async clean(): Promise<void> {}

  public async startHistoryCleaner(): Promise<void> {}

  public async stopHistoryCleaner(): Promise<void> {}

  public async ingestTools(settings: Settings): Promise<void> {}

  public async ingestInitiatives(settings: Settings): Promise<void> {}

  public async computeInitiative(
    settings: Settings,
    projectDirectory: string,
    prompt: string,
    rawToolsFromAnalysis: string[]
  ): Promise<ResultSchemaType> {
    return ResultSchema.parse({
      businessUseCases: [
        'Dolorem aliquid dignissimos',
        'Doloribus et eaque perspiciatis et est adipisci reiciendis eum vitae',
        'Qui sed rerum reiciendis totam eos iusto',
      ],
      description:
        'Suscipit qui non ut fugit incidunt ab sit. Dolores dolor eos aut reiciendis asperiores illo sint dolores tenetur. Dolorum deserunt voluptatem veniam est reprehenderit et esse amet consequatur. Dolores molestiae culpa deleniti voluptatem placeat iure. Molestias ex consectetur facere mollitia quis aut facilis assumenda inventore.',
      tools: ['Omnis', 'Ut', 'Delectus', 'Laboriosam'],
      functionalUseCases: {
        hasVirtualEmailInboxes: true,
        sendsEmails: true,
        generatesPDF: false,
      },
    });
  }

  public async assertToolsDocumentsAreReady(settings: Settings): Promise<void> {}

  public async requestAssistant(settings: Settings, sessionId: string, input: string, eventEmitter: ChunkEventEmitter): Promise<string> {
    const answer =
      'Sint non voluptate vel placeat et. Esse iste quaerat. Repudiandae dolores alias pariatur qui omnis consequuntur blanditiis odio. Id numquam reiciendis non iusto aut odio voluptatem nobis et.';

    const chunks = answer.split(' ');
    for (let i = 0; i < chunks.length; i++) {
      await sleep(50);

      eventEmitter.emit('chunk', i === chunks.length - 1 ? chunks[i] : `${chunks[i]} `);
    }

    return answer;
  }

  public async assertInitiativesDocumentsAreReady(settings: Settings): Promise<void> {}
}
