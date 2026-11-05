import { Initiative } from '@etabli/src/generated/prisma/client';
import { DatasetInitiativeSchemaType, InitiativeSchemaType } from '@etabli/src/models/entities/initiative';
import { InitiativeOrganizationSchemaType } from '@etabli/src/models/entities/organization';
import { formatOrganizationPath } from '@etabli/src/utils/organization';

export function initiativePrismaToModel(
  initiative: Initiative & {
    businessUseCases: string[];
    tools: string[];
    organizations: InitiativeOrganizationSchemaType[];
  }
): InitiativeSchemaType {
  return {
    id: initiative.id,
    name: initiative.name,
    description: initiative.description,
    websites: initiative.websites,
    repositories: initiative.repositories,
    businessUseCases: initiative.businessUseCases,
    functionalUseCases: initiative.functionalUseCases,
    tools: initiative.tools,
    organizations: initiative.organizations,
    createdAt: initiative.createdAt,
    updatedAt: initiative.updatedAt,
    deletedAt: initiative.deletedAt,
  };
}

export function datasetInitiativePrismaToModel(
  initiative: Omit<Initiative, 'originId'> & {
    businessUseCases: string[];
    tools: string[];
    organizations: InitiativeOrganizationSchemaType[];
  }
): DatasetInitiativeSchemaType {
  return {
    id: initiative.id,
    name: initiative.name,
    description: initiative.description,
    websites: initiative.websites,
    repositories: initiative.repositories,
    businessUseCases: initiative.businessUseCases,
    functionalUseCases: initiative.functionalUseCases,
    tools: initiative.tools,
    organizations: initiative.organizations.map((organization) => formatOrganizationPath(organization)),
    createdAt: initiative.createdAt,
    updatedAt: initiative.updatedAt,
    deletedAt: initiative.deletedAt,
  };
}
