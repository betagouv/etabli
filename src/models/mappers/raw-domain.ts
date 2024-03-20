import { CsvDomainTypeSchema, CsvDomainTypeSchemaType } from '@etabli/src/features/domain';
import { RawDomainTypeSchema, RawDomainTypeSchemaType } from '@etabli/src/models/entities/raw-domain';

export function rawDomainTypeCsvToModel(csvType: CsvDomainTypeSchemaType): RawDomainTypeSchemaType | null {
  switch (csvType) {
    case CsvDomainTypeSchema.Values['Commune']:
      return RawDomainTypeSchema.Values.COMMUNE;
    case CsvDomainTypeSchema.Values['EPCI']:
      return RawDomainTypeSchema.Values.PUBLIC_INTERCOMMUNAL_COOPERATION_ESTABLISHMENT;
    case CsvDomainTypeSchema.Values['Collectivité']:
      return RawDomainTypeSchema.Values.COLLECTIVITY;
    case CsvDomainTypeSchema.Values['Conseil régional']:
      return RawDomainTypeSchema.Values.REGIONAL_COUNCIL;
    case CsvDomainTypeSchema.Values['Bibliothèque']:
      return RawDomainTypeSchema.Values.LIBRARY;
    case CsvDomainTypeSchema.Values['Centre de gestion']:
      return RawDomainTypeSchema.Values.MANAGEMENT_CENTER;
    case CsvDomainTypeSchema.Values['Établissement scolaire']:
      return RawDomainTypeSchema.Values.EDUCATIONAL_INSTITUTION;
    case CsvDomainTypeSchema.Values['Conseil départemental']:
      return RawDomainTypeSchema.Values.DEPARTMENTAL_COUNCIL;
    case CsvDomainTypeSchema.Values['Université']:
      return RawDomainTypeSchema.Values.UNIVERSITY;
    case CsvDomainTypeSchema.Values['Ambassade']:
      return RawDomainTypeSchema.Values.EMBASSY;
    case CsvDomainTypeSchema.Values['Académie']:
      return RawDomainTypeSchema.Values.ACADEMY;
    case CsvDomainTypeSchema.Values['MDPH ou MDA']:
      return RawDomainTypeSchema.Values.DEPARTMENTAL_AUTONOMY_HOUSE;
    case CsvDomainTypeSchema.Values['Hôpital']:
    case CsvDomainTypeSchema.Values['APHP']:
      return RawDomainTypeSchema.Values.HOSPITAL;
    case CsvDomainTypeSchema.Values['Ministère']:
    case CsvDomainTypeSchema.Values['Gouvernement']:
      return RawDomainTypeSchema.Values.GOVERNMENT;
    case CsvDomainTypeSchema.Values['Préfécture']:
      return RawDomainTypeSchema.Values.PREFECTURE;
    case CsvDomainTypeSchema.Values['Santé']:
      return RawDomainTypeSchema.Values.HEALTH;
    case CsvDomainTypeSchema.Values['Ajout Manuel Matthieu Faure']:
    case CsvDomainTypeSchema.Values['']:
      return null;
    default:
      throw new Error('should be a defined type');
  }
}
