// This is a duplicated and modified file to respond to the issue https://github.com/langchain-ai/langchainjs/discussions/4735
// Original file: https://github.com/langchain-ai/langchainjs/blob/main/langchain/src/chains/combine_documents/base.ts
import { Document } from '@langchain/core/documents';
import { BaseMessage } from '@langchain/core/messages';
import { BasePromptTemplate, PromptTemplate } from '@langchain/core/prompts';
import { RunnableConfig } from '@langchain/core/runnables';

import { filterWithScoreThreshold } from '@etabli/src/features/llm';
import { DocumentInitiativeTemplateSchema } from '@etabli/src/gpt/template';
import { getServerTranslation } from '@etabli/src/i18n';
import { rankDocumentsWithCrossEncoder } from '@etabli/src/utils/cross-encoder';
import { linkRegistry } from '@etabli/src/utils/routes/registry';

export const DEFAULT_DOCUMENT_SEPARATOR = '\n\n';

export const DOCUMENTS_KEY = 'context';
export const INTERMEDIATE_STEPS_KEY = 'intermediate_steps';

export const DEFAULT_DOCUMENT_PROMPT = /* #__PURE__ */ PromptTemplate.fromTemplate('{page_content}');

export async function formatDocuments({
  documentPrompt,
  documentSeparator,
  documents,
  documentsMaximum,
  query,
  config,
}: {
  documentPrompt: BasePromptTemplate;
  documentSeparator: string;
  documents: Document[];
  documentsMaximum: number;
  query: string;
  config?: RunnableConfig;
}) {
  // Filter documents that are not relevant
  const filteredDocumentsWrappers = filterWithScoreThreshold(
    documents.map((document) => {
      // To respect the expected format
      return [document, document.metadata._distance];
    })
  );

  // In addition to the similarity search we perform a rerank to reorder them according to a more standard search
  // so that a query with almost perfect match are on top on the list
  let rerankResults = await rankDocumentsWithCrossEncoder(
    filteredDocumentsWrappers.map(([document, score]) => document.pageContent),
    query
  );

  // This is the custom stuff needed to give the assistant the knowledge about more sheets available (ref: https://github.com/langchain-ai/langchainjs/discussions/4735)
  // Now, it also serves to format initiatives URLs so the assistant does not mess with formatting non-existing ones
  let additionalInstructionForTheAssistant: string | null;
  if (rerankResults.length > documentsMaximum) {
    rerankResults = rerankResults.slice(0, documentsMaximum); // The first are those we the highest scoring

    additionalInstructionForTheAssistant = `Nous ne t'avons pas fourni plus de ${documents.length} initiatives car c'est ta limite. Mais ne dis pas à l'utilisateur que tu as une limite, dis-lui seulement qu'il existe d'autres initiatives et qu'il peut préciser sa recherche pour en savoir plus.`;
  } else {
    // At start we tried to tell the assistant this is the only initiatives corresponding to the conversation
    // but it was messing telling it to the user. Specifying nothing achieves the goal
    additionalInstructionForTheAssistant = null;
  }

  // TODO: should depend on the user interface local
  const { t } = getServerTranslation('common', {
    lng: 'fr',
  });

  const formattedDocs = await Promise.all(
    rerankResults.map((rerankResult) => {
      const [document, score] = filteredDocumentsWrappers[rerankResult.originalDocumentIndex];

      // We remove the `id` so the assistant does not mess trying to infer anything
      const { id, ...jsonSheetWithoutId } = DocumentInitiativeTemplateSchema.parse(JSON.parse(document.pageContent));

      // Add the formatted URL so the assistant does not make mistakes while formatting it
      const updatedPageContent = JSON.stringify({
        // We use object keys according to the user language to make sure the LLM will not try to use another language
        [t('llm.sheet.keys.link')]: linkRegistry.get('initiative', { initiativeId: id }, { absolute: true }),
        [t('llm.sheet.keys.name')]: jsonSheetWithoutId.name,
        [t('llm.sheet.keys.description')]: jsonSheetWithoutId.description,
        [t('llm.sheet.keys.websites')]: jsonSheetWithoutId.websites,
        [t('llm.sheet.keys.repositories')]: jsonSheetWithoutId.repositories,
        [t('llm.sheet.keys.businessUseCases')]: jsonSheetWithoutId.businessUseCases,
        [t('llm.sheet.keys.functionalUseCases')]: jsonSheetWithoutId.functionalUseCases,
        [t('llm.sheet.keys.tools')]: jsonSheetWithoutId.tools,
      });

      return documentPrompt.withConfig({ runName: 'document_formatter' }).invoke({ ...document.metadata, page_content: updatedPageContent }, config);
    })
  );

  return `${formattedDocs.join(documentSeparator)}${!!additionalInstructionForTheAssistant ? `\n\n${additionalInstructionForTheAssistant}` : ''}`;
}
