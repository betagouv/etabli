import { TiktokenModel } from 'tiktoken';

export interface GptSettings {
  model: string;
  countModel: TiktokenModel; // The counter does not understand precise GPT versions
  modelTokenLimit: number; // Precise token maximum can be found on https://www.scriptbyai.com/token-limit-openai-chatgpt/
  embeddingsTokenLimit: number; // Didn't find a list but considering `16384` as default is good enough, and adjust if needed according to the provider
  per1000TokensCost: number; // This is about input tokens (since our outputs should be small, we don't consider them here)
}

export type GptInstance =
  | 'v3.5'
  | 'v4'
  | 'deprecatedMistralTiny'
  | 'deprecatedMistralSmall'
  | 'deprecatedMistralMedium'
  | 'mistral7b'
  | 'mistral8x7b'
  | 'mistralSmall'
  | 'mistralMedium'
  | 'mistralLarge';

// TODO: split properly MistralAI models
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
  // MistralAI
  deprecatedMistralTiny: {
    model: 'mistral-tiny', // mistral7b
    countModel: 'gpt-4',
    modelTokenLimit: 16384,
    embeddingsTokenLimit: 16384,
    per1000TokensCost: 0.00014,
  },
  deprecatedMistralSmall: {
    model: 'mistral-small', // mixtral8x7b
    countModel: 'gpt-4',
    modelTokenLimit: 16384,
    embeddingsTokenLimit: 16384,
    per1000TokensCost: 0.0006,
  },
  deprecatedMistralMedium: {
    model: 'mistral-medium', // ...
    countModel: 'gpt-4',
    modelTokenLimit: 16384,
    embeddingsTokenLimit: 16384,
    per1000TokensCost: 0.0025,
  },
  mistral7b: {
    // New version of `tiny` a bit more expensive with more tokens capacity
    model: 'open-mistral-7b', // mistral7b
    countModel: 'gpt-4',
    modelTokenLimit: 32768,
    embeddingsTokenLimit: 16384,
    per1000TokensCost: 0.0002,
  },
  mistral8x7b: {
    // New version of `small` a bit more expensive with more tokens capacity
    model: 'open-mixtral-8x7b', // mixtral8x7b
    countModel: 'gpt-4',
    modelTokenLimit: 32768,
    embeddingsTokenLimit: 16384,
    per1000TokensCost: 0.00065,
  },
  mistralSmall: {
    model: 'mistral-small-latest',
    countModel: 'gpt-4',
    modelTokenLimit: 32768,
    embeddingsTokenLimit: 16384,
    per1000TokensCost: 0.0055,
  },
  mistralMedium: {
    model: 'mistral-medium-latest',
    countModel: 'gpt-4',
    modelTokenLimit: 32768,
    embeddingsTokenLimit: 16384,
    per1000TokensCost: 0.0075,
  },
  mistralLarge: {
    model: 'mistral-large-latest',
    countModel: 'gpt-4',
    modelTokenLimit: 32768,
    embeddingsTokenLimit: 16384,
    per1000TokensCost: 0.022,
  },
};

export const gptSeed = 100;
