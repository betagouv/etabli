import { TiktokenModel } from 'tiktoken';

export interface GptSettings {
  model: string;
  countModel: TiktokenModel; // The counter does not understand precise GPT versions
  modelTokenLimit: number; // Context window of the chat model (input + output), in tokens
  embeddingsTokenLimit: number; // Max input tokens of the embeddings model (`mistral-embed` is 8192)
  per1000TokensCost: number; // Average of input + output price per 1000 tokens (see https://mistral.ai/pricing/#api)
}

export type GptInstance = 'v3.5' | 'v4' | 'mistralSmall' | 'mistralMedium' | 'mistralLarge';

export const gptInstances: Record<GptInstance, GptSettings> = {
  // GPT
  'v3.5': {
    model: 'gpt-3.5-turbo-1106',
    countModel: 'gpt-3.5-turbo',
    modelTokenLimit: 16384,
    embeddingsTokenLimit: 16384,
    per1000TokensCost: 0.001,
  },
  v4: {
    model: 'gpt-4-1106-preview',
    countModel: 'gpt-4',
    modelTokenLimit: 16384,
    embeddingsTokenLimit: 16384,
    per1000TokensCost: 0.01,
  },
  // MistralAI — only models supporting native `json_schema` structured outputs are kept
  // We used `/v1/models` to get real tokens limit
  mistralSmall: {
    model: 'mistral-small-latest', // currently Mistral Small 4 (`mistral-small-2603`)
    countModel: 'gpt-4',
    modelTokenLimit: 262144,
    embeddingsTokenLimit: 8192,
    per1000TokensCost: 0.0002,
  },
  mistralMedium: {
    model: 'mistral-medium-latest', // currently `mistral-medium-2604`
    countModel: 'gpt-4',
    modelTokenLimit: 262144,
    embeddingsTokenLimit: 8192,
    per1000TokensCost: 0.0045,
  },
  mistralLarge: {
    model: 'mistral-large-latest', // currently `mistral-large-2512`
    countModel: 'gpt-4',
    modelTokenLimit: 262144,
    embeddingsTokenLimit: 8192,
    per1000TokensCost: 0.001,
  },
};

export const gptSeed = 100;
