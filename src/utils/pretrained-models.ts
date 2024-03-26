// This file centralized used models because they are cached during the CI/CD and cache invalidation is triggered when this file hash changes

// At start we wanted to use model specialized in french like https://huggingface.co/antoinelouis/crossencoder-camembert-base-mmarcoFR through
// the ONNX version of https://huggingface.co/antoinelouis/crossencoder-camembert-base-mmarcoFR but they are not compatible with Transformers.js
// so we ended using the 2 following ones provided directly by the Transformers.js author
export const crossEncoderModelId = 'xenova/ms-marco-TinyBERT-L-2-v2'; // Widely used and seems to have acceptable result
// export const crossEncoderModelId = 'mixedbread-ai/mxbai-rerank-xsmall-v1';
