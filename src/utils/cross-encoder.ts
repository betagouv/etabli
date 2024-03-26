import { AutoModelForSequenceClassification, AutoTokenizer, PreTrainedModel, PreTrainedTokenizer, env } from '@xenova/transformers';
import path from 'path';

import { crossEncoderModelId } from '@etabli/src/utils/pretrained-models';

const __root_dirname = process.cwd();

// During the runtime we make sure to use the local files to have a deterministic behavior
env.allowLocalModels = true;
env.allowRemoteModels = process.env.NODE_ENV !== 'production'; // Bundled application should have models given, allow downloading in development for the ease
env.localModelPath = path.resolve(__root_dirname, './data/models'); // This folder is used to put already downloaded models (could be for the production bundle)
env.cacheDir = path.resolve(__root_dirname, './.cache/models'); // Downloaded models go here and are usable from here (even if `allowRemoteModels=false`), there is no difference at the end with `localModelPath` if considering no download

export interface RankResult {
  originalDocumentIndex: number;
  score: number;
  document: string;
}

export class CrossEncoderSingleton {
  static model_id = crossEncoderModelId;
  static model: Promise<PreTrainedModel> | null = null;
  static tokenizer: Promise<PreTrainedTokenizer> | null = null;

  // To avoid loading multiple times the model and the tokenizer we use a singleton
  static async getInstance() {
    if (!this.tokenizer) {
      this.tokenizer = AutoTokenizer.from_pretrained(this.model_id);
    }

    if (!this.model) {
      let lastStatus: string = '';
      let lastProgress: number = 0;

      this.model = AutoModelForSequenceClassification.from_pretrained(this.model_id, {
        quantized: true,
        progress_callback: (data: { status: string; progress: number }) => {
          // There is no type available for now but it looks like:
          // ---
          // {
          //   status: 'progress',
          //   name: 'xenova/ms-marco-TinyBERT-L-2-v2',
          //   file: 'onnx/model_quantized.onnx',
          //   progress: 94.45777392868533,
          //   loaded: 4247103,
          //   total: 4496298
          // }
          const progress = Math.ceil(data.progress);

          if (
            data.status !== lastStatus &&
            progress !== lastProgress &&
            progress % 10 === 0 // Do not flood the console
          ) {
            console.log(`model status: ${data.status} (${progress}%)`);
          }

          lastStatus = data.status;
          lastProgress = progress;
        },
      });
    }

    return Promise.all([this.tokenizer, this.model]);
  }
}

// Listen for messages from the main thread
export async function rankDocumentsWithCrossEncoder(documents: string[], query: string): Promise<RankResult[]> {
  const [tokenizer, model] = await CrossEncoderSingleton.getInstance();

  const inputs = tokenizer(new Array(documents.length).fill(query), {
    text_pair: documents,
    padding: true,
    truncation: true,
  });

  const { logits } = await model(inputs);

  const results = logits
    .sigmoid()
    .tolist()
    .map(
      ([score]: [number], i: number): RankResult => ({
        originalDocumentIndex: i,
        score: score,
        document: documents[i],
      })
    )
    .sort((a: { score: number }, b: { score: number }) => b.score - a.score);

  return results;
}

// This should be called during the CI/CD since we forbid downloads from the production
// Note: no download is performed if the model in inside `cacheDir`
export async function downloadPretrainedModels() {
  const previousAllowRemoteModels = env.allowRemoteModels;
  env.allowRemoteModels = true;

  try {
    // Just getting the instance will download missing models and wait to complete
    await CrossEncoderSingleton.getInstance();
  } finally {
    env.allowRemoteModels = previousAllowRemoteModels;
  }
}
