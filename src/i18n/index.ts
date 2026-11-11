import type { Locale } from 'date-fns';
// import utcToZonedTime from 'date-fns-tz/utcToZonedTime';
import { formatDate } from 'date-fns/format';
import { formatDistance } from 'date-fns/formatDistance';
import { formatRelative } from 'date-fns/formatRelative';
import { isDate } from 'date-fns/isDate';
import { fr as frDateLocale } from 'date-fns/locale/fr';
import i18next from 'i18next';
import LanguageDetector from 'i18next-browser-languagedetector';
import { z } from 'zod';

import frCommonTranslations from '@etabli/src/i18n/fr/common.json';
import { capitalizeFirstLetter } from '@etabli/src/utils/format';

export const defaultNamespace = 'common';

export const resources = {
  fr: {
    common: frCommonTranslations,
  },
  // en: {
  //   common: enCommonTranslations,
  // },
};

interface DateLocales {
  [key: string]: Locale;
}

export const dateFnsLocales: DateLocales = { fr: frDateLocale };

export type Lang = 'fr' | 'en'; // If more locales available, add them here
export const supportedLanguages: Lang[] = ['fr'];
const fallbackLanguage: Lang = 'fr';

i18next.use(LanguageDetector).init(
  {
    detection: {
      order: ['cookie', 'localStorage', 'navigator'],
    },
    supportedLngs: supportedLanguages,
    fallbackLng: fallbackLanguage,
    defaultNS: defaultNamespace,
    returnEmptyString: false,
    returnNull: false,
    interpolation: {
      escapeValue: false, // React already safes from xss
      format: (value, format, lng, options) => {
        if (!!format && !!lng) {
          if (isDate(value)) {
            if (options) {
              // TODO: `date-fns-tz/utcToZonedTime` is not compatible for now with `date-fns` v3
              // // If specified we shift the date from UTC (with its offset marker)
              // // to the right time without any offset marker (useful to format on server-side)
              // if (options.timezone) {
              //   value = utcToZonedTime(value, options.timezone);
              // }
            }

            const locale = dateFnsLocales[lng];

            if (format === 'short') return formatDate(value, 'P', { locale });
            if (format === 'long') return formatDate(value, 'PPPP', { locale });
            if (format === 'longWithTime') return formatDate(value, 'PPPPpp', { locale });
            if (format === 'relative') return formatRelative(value, new Date(), { locale });
            if (format === 'ago') {
              return formatDistance(value, new Date(), {
                locale,
                addSuffix: true,
              });
            }
            if (format === 'spreadsheetDate') return formatDate(value, 'yyyy-MM-dd', { locale });
            if (format === 'spreadsheetDateTime') return formatDate(value, 'yyyy-MM-dd HH:mm:ss', { locale });

            return formatDate(value, format, { locale });
          }
        }

        return value;
      },
    },
    resources: resources,
    debug: false,
  },
  (err, t) => {
    // Set locale on other librairies according to the locale detected by `LanguageDetector`
    const detectedLocale = i18next.language;
  }
);

export const i18n = i18next;

export interface UseServerTranslationOptions {
  lng?: string;
  timezone?: string;
}

export const getServerTranslation = (ns?: string, options?: UseServerTranslationOptions) => {
  const scopedI18n = i18n.cloneInstance();

  if (ns) {
    scopedI18n.setDefaultNamespace(ns);
  }

  let timezone: string = 'Europe/Paris';
  if (options) {
    if (options.lng) {
      scopedI18n.changeLanguage(options.lng);
    }

    if (options.timezone) {
      timezone = options.timezone;
    }
  }

  // [WORKAROUND] There is no way to add a preprocessor to i18next (whereas postprocessors are implemented)
  // so we wrap the initial `t()` function to allow passing a default date timezone that will be used during interpolation operations
  // This is useful on the server-side when rendering documents or emails because all dates from the database are UTC by default
  const originalTFunction = scopedI18n.t;

  scopedI18n.t = function (key: string, parameters?: any): any {
    if (!parameters) {
      parameters = {};
    }

    parameters.timezone = timezone;

    return originalTFunction(key, parameters);
  } as any;

  return scopedI18n;
};

// This alias to mimic the hook naming logic (but some backend files need the `getServerTranslation` to avoid a complain from the ESLint rule `react-hooks/rules-of-hooks`)
export const useServerTranslation = getServerTranslation;

//
// Bind zod validation errors to i18next to reuse translations (on frontend and backend)
//

export const getIssueTranslationWithSubpath = (issue: z.core.$ZodRawIssue, subpath: string | null, parameters: any): string | null => {
  // For custom error the usual zod code is similar to the "error ID" (or error type)
  let code: z.core.$ZodIssueCode;
  if (issue.code === 'custom') {
    code = issue.params?.type || 'unknown';
  } else {
    code = issue.code;
  }

  const fullI18nPath = !!subpath ? `errors.validation.${subpath}.${code}` : `errors.validation.${code}`;
  const translation = i18n.t(fullI18nPath, parameters);

  return translation !== fullI18nPath ? translation : null;
};

export const formatMessageFromIssue = (issue: z.core.$ZodRawIssue): string | null => {
  // The validated value and the schema instance are not translation parameters (and the value could be huge)
  const { code, path, message, input, inst, ...potentialParameters } = issue;

  if (path) {
    // Since there is no issue code for "required/nonempty" and we have to use `min(1)`
    // We need to distinguish them during translation: `0..1` for a required field, `2+` for the minimum rule
    // Note: we could have kept just one and managing it by keeping in mind for a specific field...
    if (issue.code === 'too_small' && issue.origin === 'string') {
      (potentialParameters as any).count = issue.minimum;
    }

    // Skip number since arrays have no sense for i18n paths
    const valuablePathParts = path.filter((v) => typeof v === 'string') as string[];

    // Check for an exact match, if not, try finding the error in a more general context (upper layers)
    for (let i = 0; i < valuablePathParts.length; i++) {
      const translation = getIssueTranslationWithSubpath(issue, valuablePathParts.slice(i).join('.'), potentialParameters);

      // Also check it's not an object if not end i18n translation
      if (!!translation && typeof translation !== 'object') {
        return translation;
      }
    }
  }

  return null;
};

export const customErrorMap: z.core.$ZodErrorMap = (issue) => {
  const retrievedTranslation = formatMessageFromIssue(issue);

  // Without a translation nothing is returned so zod uses its own message
  // ---
  // Our errors are lowercase to combine them as we want
  // In this case, for field highligh we want the sentence to be uppercase on the first letter
  return retrievedTranslation ? { message: capitalizeFirstLetter(retrievedTranslation) } : undefined;
};

z.config({
  customError: customErrorMap,
});
