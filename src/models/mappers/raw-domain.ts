import { CsvDomainTypeSchema, CsvDomainTypeSchemaType } from '@etabli/src/features/domain';
import { RawDomainTypeSchema, RawDomainTypeSchemaType } from '@etabli/src/models/entities/raw-domain';

export function rawDomainTypeCsvToModel(csvType: CsvDomainTypeSchemaType): RawDomainTypeSchemaType | null {
  switch (csvType) {
    case CsvDomainTypeSchema.enum['Commune']:
      return RawDomainTypeSchema.enum.COMMUNE;
    case CsvDomainTypeSchema.enum['EPCI']:
      return RawDomainTypeSchema.enum.PUBLIC_INTERCOMMUNAL_COOPERATION_ESTABLISHMENT;
    case CsvDomainTypeSchema.enum['Collectivité']:
      return RawDomainTypeSchema.enum.COLLECTIVITY;
    case CsvDomainTypeSchema.enum['Conseil régional']:
      return RawDomainTypeSchema.enum.REGIONAL_COUNCIL;
    case CsvDomainTypeSchema.enum['Bibliothèque']:
      return RawDomainTypeSchema.enum.LIBRARY;
    case CsvDomainTypeSchema.enum['Centre de gestion']:
      return RawDomainTypeSchema.enum.MANAGEMENT_CENTER;
    case CsvDomainTypeSchema.enum['Établissement scolaire']:
      return RawDomainTypeSchema.enum.EDUCATIONAL_INSTITUTION;
    case CsvDomainTypeSchema.enum['Conseil départemental']:
      return RawDomainTypeSchema.enum.DEPARTMENTAL_COUNCIL;
    case CsvDomainTypeSchema.enum['Université']:
      return RawDomainTypeSchema.enum.UNIVERSITY;
    case CsvDomainTypeSchema.enum['Ambassade']:
      return RawDomainTypeSchema.enum.EMBASSY;
    case CsvDomainTypeSchema.enum['Académie']:
      return RawDomainTypeSchema.enum.ACADEMY;
    case CsvDomainTypeSchema.enum['MDPH ou MDA']:
      return RawDomainTypeSchema.enum.DEPARTMENTAL_AUTONOMY_HOUSE;
    case CsvDomainTypeSchema.enum['Hôpital']:
    case CsvDomainTypeSchema.enum['APHP']:
      return RawDomainTypeSchema.enum.HOSPITAL;
    case CsvDomainTypeSchema.enum['Ministère']:
    case CsvDomainTypeSchema.enum['Gouvernement']:
      return RawDomainTypeSchema.enum.GOVERNMENT;
    case CsvDomainTypeSchema.enum['Préfécture']:
      return RawDomainTypeSchema.enum.PREFECTURE;
    case CsvDomainTypeSchema.enum['Santé']:
      return RawDomainTypeSchema.enum.HEALTH;
    case CsvDomainTypeSchema.enum['Ajout Manuel Matthieu Faure']:
    case CsvDomainTypeSchema.enum['']:
      return null;
    default:
      throw new Error('should be a defined type');
  }
}
