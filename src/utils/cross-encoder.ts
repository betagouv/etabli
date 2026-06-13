import { AutoModelForSequenceClassification, AutoTokenizer, PreTrainedModel, PreTrainedTokenizer, env } from '@xenova/transformers';
import { secondsToMilliseconds } from 'date-fns/secondsToMilliseconds';
import path from 'path';

import { crossEncoderModelId } from '@etabli/src/utils/pretrained-models';
import { sleep } from '@etabli/src/utils/sleep';

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

// The model max sequence length (CamemBERT). Every pair is padded/truncated to exactly this — see below.
const CROSS_ENCODER_MAX_LENGTH = 512;

// We rerank the WHOLE candidate pool (up to ~100 initiatives: vector + lexical + previously-shown). We score ONE
// (query, document) pair at a time, each padded to a FIXED length, instead of feeding the whole pool as one big batch.
//
//  1. MEMORY: a single forward pass over N sequences padded to the longest one allocates attention activations that
//     scale with `N * length²`. For ~100 documents that transiently reaches >1 GB of NATIVE (off-heap) ONNX memory,
//     which is NOT bounded by `--max-old-space-size` (that only caps the V8 JS heap). On the 2 GB production instance
//     this pushed the process past the cgroup limit and got it OOM-killed (SIGKILL → 503 → restart → model reload).
//     One pair at a time keeps peak memory at the model weights (~600 MB) plus a single 512-token sequence (~tens of MB).
//  2. CORRECTNESS / DETERMINISM: this converted ONNX model is padding-sensitive — scoring a pair with NO padding gives
//     mushy, poorly-separated scores (verified empirically), so per-pair scoring must still pad. But padding to the
//     longest doc *in the batch* (the old behavior) makes each score depend on whatever else is in the pool, which is
//     both non-deterministic and the reason batching distorts the ranking. Padding every pair to a FIXED length instead
//     restores the discriminative scores AND makes each (query, document) score independent and reproducible. The score
//     is stable for any fixed length above the document's real token count (extra padding is masked), so we simply use
//     the model max.
export async function rankDocumentsWithCrossEncoder(documents: string[], query: string): Promise<RankResult[]> {
  const [tokenizer, model] = await CrossEncoderSingleton.getInstance();

  const results: RankResult[] = [];

  for (let i = 0; i < documents.length; i++) {
    const inputs = tokenizer([query], {
      text_pair: [documents[i]],
      padding: 'max_length', // pad to a FIXED length (not to other docs in a batch) so scores are deterministic and well-separated
      max_length: CROSS_ENCODER_MAX_LENGTH,
      truncation: true,
    });

    const { logits } = await model(inputs);

    const [[score]] = logits.sigmoid().tolist();

    results.push({
      originalDocumentIndex: i,
      score: score,
      document: documents[i],
    });
  }

  return results.sort((a, b) => b.score - a.score);
}

// This should be called during the CI/CD since we forbid downloads from the production
// Note: no download is performed if the model in inside `cacheDir`
export async function downloadPretrainedModels() {
  const previousAllowRemoteModels = env.allowRemoteModels;
  env.allowRemoteModels = true;

  // HuggingFace rate-limits unauthenticated downloads (HTTP 429), and CI runs share IPs so a fresh download
  // (e.g. right after the model id changed and invalidated the CI cache) often gets throttled. The download is
  // otherwise reliable and gets cached afterwards, so we just retry the transient failures with a backoff.
  const maxAttempts = 5;

  try {
    for (let attempt = 1; ; attempt++) {
      try {
        // Just getting the instance will download missing models and wait to complete
        await CrossEncoderSingleton.getInstance();

        break;
      } catch (error) {
        // The singleton memoizes the (now rejected) promises, so we must reset it before retrying otherwise the
        // next `getInstance()` call would just return the cached rejection.
        CrossEncoderSingleton.model = null;
        CrossEncoderSingleton.tokenizer = null;

        if (attempt >= maxAttempts) {
          throw error;
        }

        const delay = secondsToMilliseconds(Math.min(60, 5 * 2 ** (attempt - 1))); // 5s, 10s, 20s, 40s, then capped at 60s
        console.warn(`unable to download the pretrained models (attempt ${attempt}/${maxAttempts}), retrying in ${delay / 1000}s`);
        console.warn(error);

        await sleep(delay);
      }
    }
  } finally {
    env.allowRemoteModels = previousAllowRemoteModels;
  }
}
