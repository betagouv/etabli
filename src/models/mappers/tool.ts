import { CsvToolCategorySchema, CsvToolCategorySchemaType } from '@etabli/src/features/tool';
import { ToolCategorySchema, ToolCategorySchemaType } from '@etabli/src/models/entities/tool';

export function toolTypeCsvToModel(csvType: CsvToolCategorySchemaType): ToolCategorySchemaType {
  switch (csvType) {
    case CsvToolCategorySchema.enum['languages-and-frameworks']:
      return ToolCategorySchema.enum.LANGUAGES_AND_FRAMEWORKS;
    case CsvToolCategorySchema.enum['build-test-deploy']:
      return ToolCategorySchema.enum.BUILD_TEST_DEPLOY;
    case CsvToolCategorySchema.enum['libraries']:
      return ToolCategorySchema.enum.LIBRARIES;
    case CsvToolCategorySchema.enum['data-stores']:
      return ToolCategorySchema.enum.DATA_STORES;
    case CsvToolCategorySchema.enum['collaboration']:
      return ToolCategorySchema.enum.COLLABORATION;
    case CsvToolCategorySchema.enum['back-office']:
      return ToolCategorySchema.enum.BACK_OFFICE;
    case CsvToolCategorySchema.enum['analytics']:
      return ToolCategorySchema.enum.ANALYTICS;
    case CsvToolCategorySchema.enum['application-hosting']:
      return ToolCategorySchema.enum.APPLICATION_HOSTING;
    case CsvToolCategorySchema.enum['application-utilities']:
      return ToolCategorySchema.enum.APPLICATION_UTILITIES;
    case CsvToolCategorySchema.enum['assets-and-media']:
      return ToolCategorySchema.enum.ASSETS_AND_MEDIA;
    case CsvToolCategorySchema.enum['support-sales-and-marketing']:
      return ToolCategorySchema.enum.SUPPORT_SALES_AND_MARKETING;
    case CsvToolCategorySchema.enum['design']:
      return ToolCategorySchema.enum.DESIGN;
    case CsvToolCategorySchema.enum['monitoring']:
      return ToolCategorySchema.enum.MONITORING;
    case CsvToolCategorySchema.enum['payments']:
      return ToolCategorySchema.enum.PAYMENTS;
    case CsvToolCategorySchema.enum['communications']:
      return ToolCategorySchema.enum.COMMUNICATIONS;
    case CsvToolCategorySchema.enum['mobile']:
      return ToolCategorySchema.enum.MOBILE;
    default:
      throw new Error('should be a defined type');
  }
}
