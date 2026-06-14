// This file centralized used models because they are cached during the CI/CD and cache invalidation is triggered when this file hash changes

// We use a French cross-encoder (CamemBERT-base trained on mMARCO-fr) because the initiatives and queries are in French
// and because the previous English `ms-marco-TinyBERT-L-2-v2` reranked French content poorly...
// The reference model is https://huggingface.co/antoinelouis/crossencoder-camembert-base-mmarcoFR but not compatible with Transformers.js so we converted it to work as ONNX
export const crossEncoderModelId = 'sneko/crossencoder-camembert-L4-mmarcoFR-onnx';
