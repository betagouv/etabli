import { Initiative } from '@etabli/src/generated/prisma/client';
import { DatasetInitiativeSchemaType, InitiativeSchemaType } from '@etabli/src/models/entities/initiative';
import { InitiativeOrganizationSchemaType } from '@etabli/src/models/entities/organization';
import { formatOrganizationPath } from '@etabli/src/utils/organization';
import { getRelativeReputation } from '@etabli/src/utils/reputation';

export function initiativePrismaToModel(
  initiative: Initiative & {
    businessUseCases: string[];
    tools: string[];
    organizations: InitiativeOrganizationSchemaType[];
    reputationReferenceRank: number | null;
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
    reputationRank: initiative.reputationRank,
    repositoryStars: initiative.repositoryStars,
    relativeReputation: getRelativeReputation(initiative.reputationRank, initiative.reputationReferenceRank),
    computedAt: initiative.computedAt ?? initiative.createdAt, // Sheets created before this date existed
    createdAt: initiative.createdAt,
    updatedAt: initiative.updatedAt,
    deletedAt: initiative.deletedAt,
  };
}

export function datasetInitiativePrismaToModel(
  initiative: Omit<
    Initiative,
    | 'originId'
    | 'computedAt'
    | 'repositoryStars'
    | 'httpSecurityGrade'
    | 'tlsLevel'
    | 'tlsIssues'
    | 'mailSecurityLevel'
    | 'mailIssues'
    | 'hasLegalNotice'
    | 'hasPrivacyPolicy'
    | 'foreignDependencyLevel'
  > & {
    businessUseCases: string[];
    tools: string[];
    organizations: InitiativeOrganizationSchemaType[];
    reputationReferenceRank: number | null;
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
    relativeReputation: getRelativeReputation(initiative.reputationRank, initiative.reputationReferenceRank),
    organizations: initiative.organizations.map((organization) => formatOrganizationPath(organization)),
    createdAt: initiative.createdAt,
    updatedAt: initiative.updatedAt,
    deletedAt: initiative.deletedAt,
  };
}
