import { Initiative } from '@prisma/client';

import { DatasetInitiativeSchemaType, InitiativeSchemaType } from '@etabli/src/models/entities/initiative';

export function initiativePrismaToModel(
  initiative: Initiative & {
    businessUseCases: string[];
    tools: string[];
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
    createdAt: initiative.createdAt,
    updatedAt: initiative.updatedAt,
    deletedAt: initiative.deletedAt,
  };
}

export function datasetInitiativePrismaToModel(
  initiative: Omit<Initiative, 'originId'> & {
    businessUseCases: string[];
    tools: string[];
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
    createdAt: initiative.createdAt,
    updatedAt: initiative.updatedAt,
    deletedAt: initiative.deletedAt,
  };
}
