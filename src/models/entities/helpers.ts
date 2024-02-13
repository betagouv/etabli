import { CustomErrorInterface, CustomErrorProperties } from 'ts-custom-error';
import z, { IssueData } from 'zod';

import { i18n } from '@etabli/src/i18n';
import { CustomError } from '@etabli/src/models/entities/errors';

export interface ZodIssueOptions {
  overridePath?: string[];
}

export function customErrorToZodIssue(customError: CustomErrorInterface & CustomErrorProperties, options?: ZodIssueOptions): IssueData {
  return {
    path: options?.overridePath || undefined,
    code: z.ZodIssueCode.custom,
    params: {
      type: customError.code,
    },
    message: customError.message,
  };
}

export const getCustomErrorTranslation = (error: CustomError): string | null => {
  const fullI18nPath = `errors.custom.${error.code}`;
  const translation = i18n.t(fullI18nPath, {} as any);

  return translation !== fullI18nPath ? translation : null;
};

export const formatMessageFromCustomError = (error: CustomError): string | null => {
  let translation = getCustomErrorTranslation(error);

  // Also check it's not an object if not end i18n translation
  if (!!translation && typeof translation !== 'object') {
    return translation;
  }

  return null;
};
