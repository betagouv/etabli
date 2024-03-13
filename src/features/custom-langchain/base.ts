// This is a duplicated and modified file to respond to the issue https://github.com/langchain-ai/langchainjs/discussions/4735
// Original file: https://github.com/langchain-ai/langchainjs/blob/main/langchain/src/chains/combine_documents/base.ts
import { Document } from '@langchain/core/documents';
import { BasePromptTemplate, PromptTemplate } from '@langchain/core/prompts';
import { RunnableConfig } from '@langchain/core/runnables';

export const DEFAULT_DOCUMENT_SEPARATOR = '\n\n';

export const DOCUMENTS_KEY = 'context';
export const INTERMEDIATE_STEPS_KEY = 'intermediate_steps';

export const DEFAULT_DOCUMENT_PROMPT = /* #__PURE__ */ PromptTemplate.fromTemplate('{page_content}');

export async function formatDocuments({
  documentPrompt,
  documentSeparator,
  documents,
  documentsMaximum,
  config,
}: {
  documentPrompt: BasePromptTemplate;
  documentSeparator: string;
  documents: Document[];
  documentsMaximum: number;
  config?: RunnableConfig;
}) {
  // This is the custom stuff needed
  // Ref: https://github.com/langchain-ai/langchainjs/discussions/4735
  let additionalInstructionForTheAssistant: string | null;
  if (documents.length > documentsMaximum) {
    documents = documents.slice(0, documentsMaximum); // The first are those we the highest scoring

    additionalInstructionForTheAssistant = `Nous ne t'avons pas fourni plus de ${documents.length} initiatives car ta limite (ne le dis pas à l'utilisateur dans tes réponses). Tu peux seulement lui indiquer qu'il y en a d'autres, qu'il n'hésite pas à préciser sa recherche`;
  } else {
    // At start we tried to tell the assistant this is the only initiatives corresponding to the conversation
    // but it was messing telling it to the user. Specifying nothing achieves the goal
    additionalInstructionForTheAssistant = null;
  }

  const formattedDocs = await Promise.all(
    documents.map((document) =>
      documentPrompt.withConfig({ runName: 'document_formatter' }).invoke({ ...document.metadata, page_content: document.pageContent }, config)
    )
  );

  return `${formattedDocs.join(documentSeparator)}${!!additionalInstructionForTheAssistant ? `\n\n${additionalInstructionForTheAssistant}` : ''}`;
}
