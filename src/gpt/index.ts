import { TiktokenModel } from 'tiktoken';

export interface GptSettings {
  model: string;
  countModel: TiktokenModel; // The counter does not understand precise GPT versions
  modelTokenLimit: number; // Precise token maximum can be found on https://www.scriptbyai.com/token-limit-openai-chatgpt/
  per1000TokensCost: number; // This is about input tokens (since our outputs should be small, we don't consider them here)
}

export type GptInstance = 'v3.5' | 'v4' | 'tiny' | 'small' | 'medium';

// TODO: split properly MistralAI models
export const gptInstances: Record<GptInstance, GptSettings> = {
  'v3.5': {
    model: 'gpt-3.5-turbo-1106',
    countModel: 'gpt-3.5-turbo',
    modelTokenLimit: 16385,
    per1000TokensCost: 0.001,
  },
  v4: {
    model: 'gpt-4-1106-preview',
    countModel: 'gpt-4',
    modelTokenLimit: 16385,
    per1000TokensCost: 0.01,
  },
  tiny: {
    model: 'mistral-tiny', // mistral7b
    countModel: 'gpt-4',
    modelTokenLimit: 16385,
    per1000TokensCost: 0.00014,
  },
  small: {
    model: 'mistral-small', // mixtral8x7b
    countModel: 'gpt-4',
    modelTokenLimit: 16385,
    per1000TokensCost: 0.0006,
  },
  medium: {
    model: 'mistral-medium', // ...
    countModel: 'gpt-4',
    modelTokenLimit: 16385,
    per1000TokensCost: 0.0025,
  },
};

export const gptSeed = 100;
