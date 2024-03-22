import {
  // See Webpack aliases into `@etabli/.storybook/main.js` to understand why we use the browser version at the end even if not optimal
  stringify,
} from 'csv-stringify/browser/esm/sync';

import { getServerTranslation } from '@etabli/src/i18n';
import type { InitiativeSchemaType } from '@etabli/src/models/entities/initiative';
import { FunctionalUseCaseSchemaType } from '@etabli/src/models/entities/initiative';
import { nameof } from '@etabli/src/utils/typescript';

const typedNameof = nameof<InitiativeSchemaType>;

export function initiativesToCsv(initiatives: InitiativeSchemaType[], rawFormat: boolean = false): string {
  const { t } = getServerTranslation('common');

  const data = stringify(initiatives, {
    delimiter: ',',
    header: true,
    columns: [
      { key: typedNameof('id'), header: rawFormat ? typedNameof('id') : t('document.template.Initiative.columns.id') },
      { key: typedNameof('name'), header: rawFormat ? typedNameof('name') : t('document.template.Initiative.columns.name') },
      { key: typedNameof('description'), header: rawFormat ? typedNameof('description') : t('document.template.Initiative.columns.description') },
      { key: typedNameof('websites'), header: rawFormat ? typedNameof('websites') : t('document.template.Initiative.columns.websites') },
      { key: typedNameof('repositories'), header: rawFormat ? typedNameof('repositories') : t('document.template.Initiative.columns.repositories') },
      {
        key: typedNameof('businessUseCases'),
        header: rawFormat ? typedNameof('businessUseCases') : t('document.template.Initiative.columns.businessUseCases'),
      },
      {
        key: typedNameof('functionalUseCases'),
        header: rawFormat ? typedNameof('functionalUseCases') : t('document.template.Initiative.columns.functionalUseCases'),
      },
      { key: typedNameof('tools'), header: rawFormat ? typedNameof('tools') : t('document.template.Initiative.columns.tools') },
      { key: typedNameof('createdAt'), header: rawFormat ? typedNameof('createdAt') : t('document.template.Initiative.columns.createdAt') },
      { key: typedNameof('updatedAt'), header: rawFormat ? typedNameof('updatedAt') : t('document.template.Initiative.columns.updatedAt') },
      { key: typedNameof('deletedAt'), header: rawFormat ? typedNameof('deletedAt') : t('document.template.Initiative.columns.deletedAt') },
    ],
    cast: {
      boolean: function (value) {
        if (rawFormat) {
          return value ? 'TRUE' : 'FALSE';
        }

        return value ? t(`document.csv.boolean.true`) : t(`document.csv.boolean.false`);
      },
      date: function (value) {
        // Use a specific format so tools importing the CSV file can autodetect the field and convert it to dates (with all customization the tool allow)
        // (it should respect `YYYY-MM-DD hh:mm:ss`)

        // Note: there is no unified way across tools to inject the timezone into the CSV value so it can be translated when importing
        // the document, so we force the timezone to UTC+1 since there si no reason to be something else for people downloading the file
        return t(`document.csv.date.withTime`, { date: value });
      },
      object: function (value: any, context) {
        if (Array.isArray(value)) {
          const items = value.map((item) => {
            if (!rawFormat) {
              if (context.column === typedNameof('functionalUseCases')) {
                return t(`model.initiative.functionalUseCase.enum.${item as FunctionalUseCaseSchemaType}`);
              }
            }

            return item;
          });

          // Since Excel and other tools are not great at having an array within a cell, we set each item on a new line so it is readable
          // Note: if people wants a deeper analysis for cell array they should do some programmation (either with a spreadsheet function, or from the JSON file)
          return items.join('\n');
        }

        // By default returns a stringified object
        return JSON.stringify(value);
      },
      string: function (value: any, context) {
        if (!rawFormat) {
          if (context.column === typedNameof('functionalUseCases')) {
            return t(`model.initiative.functionalUseCase.enum.${value as FunctionalUseCaseSchemaType}`);
          }
        }

        return value;
      },
    },
  });

  return data;
}
