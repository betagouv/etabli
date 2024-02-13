import { Initiative } from '@prisma/client';

import { InitiativeSchemaType } from '@etabli/src/models/entities/initiative';

export function initiativePrismaToModel(initiative: Initiative): InitiativeSchemaType {
  return {
    id: initiative.id,
    name: initiative.name,
    description: initiative.description,
    websites: initiative.websites,
    repositories: initiative.repositories,
    // TODO: use cases, tools
    createdAt: initiative.createdAt,
    updatedAt: initiative.updatedAt,
    deletedAt: initiative.deletedAt,
  };
}
