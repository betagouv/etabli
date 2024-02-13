import { CsvToolCategorySchema, CsvToolCategorySchemaType } from '@etabli/src/features/tool';
import { ToolCategorySchema, ToolCategorySchemaType } from '@etabli/src/models/entities/tool';

export function toolTypeCsvToModel(csvType: CsvToolCategorySchemaType): ToolCategorySchemaType {
  switch (csvType) {
    case CsvToolCategorySchema.Values['languages-and-frameworks']:
      return ToolCategorySchema.Values.LANGUAGES_AND_FRAMEWORKS;
    case CsvToolCategorySchema.Values['build-test-deploy']:
      return ToolCategorySchema.Values.BUILD_TEST_DEPLOY;
    case CsvToolCategorySchema.Values['libraries']:
      return ToolCategorySchema.Values.LIBRARIES;
    case CsvToolCategorySchema.Values['data-stores']:
      return ToolCategorySchema.Values.DATA_STORES;
    case CsvToolCategorySchema.Values['collaboration']:
      return ToolCategorySchema.Values.COLLABORATION;
    case CsvToolCategorySchema.Values['back-office']:
      return ToolCategorySchema.Values.BACK_OFFICE;
    case CsvToolCategorySchema.Values['analytics']:
      return ToolCategorySchema.Values.ANALYTICS;
    case CsvToolCategorySchema.Values['application-hosting']:
      return ToolCategorySchema.Values.APPLICATION_HOSTING;
    case CsvToolCategorySchema.Values['application-utilities']:
      return ToolCategorySchema.Values.APPLICATION_UTILITIES;
    case CsvToolCategorySchema.Values['assets-and-media']:
      return ToolCategorySchema.Values.ASSETS_AND_MEDIA;
    case CsvToolCategorySchema.Values['support-sales-and-marketing']:
      return ToolCategorySchema.Values.SUPPORT_SALES_AND_MARKETING;
    case CsvToolCategorySchema.Values['design']:
      return ToolCategorySchema.Values.DESIGN;
    case CsvToolCategorySchema.Values['monitoring']:
      return ToolCategorySchema.Values.MONITORING;
    case CsvToolCategorySchema.Values['payments']:
      return ToolCategorySchema.Values.PAYMENTS;
    case CsvToolCategorySchema.Values['communications']:
      return ToolCategorySchema.Values.COMMUNICATIONS;
    case CsvToolCategorySchema.Values['mobile']:
      return ToolCategorySchema.Values.MOBILE;
    default:
      throw new Error('should be a defined type');
  }
}
