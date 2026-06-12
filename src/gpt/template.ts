import ts from 'typescript';
import { z } from 'zod';

export const ResultSchema = z
  .object({
    name: z.string(),
    businessUseCases: z.array(z.string()),
    description: z.string(),
    tools: z.array(z.string()),
    functionalUseCases: z.object({
      hasVirtualEmailInboxes: z.boolean(),
      sendsEmails: z.boolean(),
      sendsPushNotifications: z.boolean(),
      generatesPDF: z.boolean(),
      generatesSpreadsheetFile: z.boolean(),
      hasSearchSystem: z.boolean(),
      hasAuthenticationSystem: z.boolean(),
      providesTwoFactorAuthentication: z.boolean(),
      managesFileUpload: z.boolean(),
      hasPaymentSystem: z.boolean(),
      hasSeveralLanguagesAvailable: z.boolean(),
      reportsAnalytics: z.boolean(),
      reportsErrors: z.boolean(),
      displaysCartographyMap: z.boolean(),
      usesArtificialIntelligence: z.boolean(),
      exposesApiEndpoints: z.boolean(),
    }),
  })
  .strict();
export type ResultSchemaType = z.infer<typeof ResultSchema>;

// [IMPORTANT] This must be manually updated when changing the structure above (since there is no way to stringify a typescript definition without complex preprocessing)
// Inside `vscode` just hover `ResultSchemaType` with your cursor and copy/paste the type
// It will serve as a result model for the LLM with types
export const resultSchemaDefinition: string = `
interface ResultSchemaType {
  name: string;
  businessUseCases: string[];
  description: string;
  tools: string[];
  functionalUseCases: {
    hasVirtualEmailInboxes: boolean;
    sendsEmails: boolean;
    sendsPushNotifications: boolean;
    generatesPDF: boolean;
    generatesSpreadsheetFile: boolean;
    hasSearchSystem: boolean;
    hasAuthenticationSystem: boolean;
    providesTwoFactorAuthentication: boolean;
    managesFileUpload: boolean;
    hasPaymentSystem: boolean;
    hasSeveralLanguagesAvailable: boolean;
    reportsAnalytics: boolean;
    reportsErrors: boolean;
    displaysCartographyMap: boolean;
    usesArtificialIntelligence: boolean;
    exposesApiEndpoints: boolean;
  };
}
`.trim();

export const WebsiteTemplateSchema = z
  .object({
    deducedTools: z.array(z.string()).nullable(),
    content: z.string(),
  })
  .strict();
export type WebsiteTemplateSchemaType = z.infer<typeof WebsiteTemplateSchema>;

export const RepositoryTemplateSchema = z
  .object({
    functions: z.array(z.string()).nullable(),
    dependencies: z.array(z.string()).nullable(),
    readme: z.string().nullable(),
  })
  .strict();
export type RepositoryTemplateSchemaType = z.infer<typeof RepositoryTemplateSchema>;

export const InitiativeTemplateSchema = z
  .object({
    probableInitiativeName: z.string(),
    resultSchemaDefinition: z.string(),
    websites: z.array(WebsiteTemplateSchema),
    repositories: z.array(RepositoryTemplateSchema),
    messageToAppend: z.string().optional(),
  })
  .strict();
export type InitiativeTemplateSchemaType = z.infer<typeof InitiativeTemplateSchema>;

export const DocumentInitiativeTemplateSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    description: z.string(),
    websites: z.array(z.string()).nullable(),
    repositories: z.array(z.string()).nullable(),
    businessUseCases: z.array(z.string()).nullable(),
    functionalUseCases: z.array(z.string()).nullable(),
    tools: z.array(z.string()).nullable(),
  })
  .strict();
export type DocumentInitiativeTemplateSchemaType = z.infer<typeof DocumentInitiativeTemplateSchema>;

export const AssistantSearchIntentSchema = z
  .object({
    standaloneQuestion: z
      .string()
      .describe(
        "Le dernier message de l'utilisateur reformulé en une question autonome, compréhensible sans avoir lu l'historique (les références aux initiatives déjà mentionnées sont remplacées par leurs noms exacts). Sert à générer la réponse finale."
      ),
    searchQuery: z
      .string()
      .describe(
        'Version courte et distillée du sujet de la recherche : uniquement les termes thématiques, sans formules de politesse ni tournures vagues, et SANS synonymes. Sert à la recherche sémantique (embeddings).'
      ),
    searchKeywords: z
      .array(z.string())
      .describe(
        'Mots-clés thématiques principaux ET leurs synonymes ou termes proches en français. Sert à la recherche par mots-clés (full-text). Exemple pour « police » : ["police", "gendarmerie", "forces de l\'ordre", "sécurité intérieure"].'
      ),
  })
  .strict();
export type AssistantSearchIntentSchemaType = z.infer<typeof AssistantSearchIntentSchema>;

export const DocumentInitiativesChunkTemplateSchema = z
  .object({
    currentChunkNumber: z.number().nonnegative(),
    chunksTotal: z.number().nonnegative(),
    formattedInitiatives: z.array(z.string()),
  })
  .strict();
export type DocumentInitiativesChunkTemplateSchemaType = z.infer<typeof DocumentInitiativesChunkTemplateSchema>;
