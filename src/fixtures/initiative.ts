import { DomainReputationSchemaType, FunctionalUseCaseSchema, InitiativeSchema, InitiativeSchemaType } from '@etabli/src/models/entities/initiative';
import {
  InitiativeOrganizationSchema,
  InitiativeOrganizationSchemaType,
  OrganizationOptionSchema,
  OrganizationOptionSchemaType,
  OrganizationsMapSchema,
  OrganizationsMapSchemaType,
} from '@etabli/src/models/entities/organization';

const centralAdministration = { id: 'c79cb3ba-745e-5d9a-8903-4a02327a7e01', name: 'Administration centrale', acronym: null };
const government = { id: 'c79cb3ba-745e-5d9a-8903-4a02327a7e02', name: 'Gouvernement (Premier ministre et ministères)', acronym: null };
const ministry = { id: 'c79cb3ba-745e-5d9a-8903-4a02327a7e03', name: "Ministère de l'Action et des Comptes publics", acronym: null };
const dinum = { id: 'c79cb3ba-745e-5d9a-8903-4a02327a7e04', name: 'Direction interministérielle du numérique (DINUM)', acronym: 'DINUM' };

export const organizations: InitiativeOrganizationSchemaType[] = [
  InitiativeOrganizationSchema.parse({
    id: 'c79cb3ba-745e-5d9a-8903-4a02327a7e05',
    name: 'Département Accompagnement des services numériques (ASN)',
    acronym: null,
    level: 5,
    directoryUrl: 'https://lannuaire.service-public.gouv.fr/gouvernement/c79cb3ba-745e-5d9a-8903-4a02327a7e05',
    isTerritorial: false,
    ancestors: [centralAdministration, government, ministry, dinum],
  }),
  InitiativeOrganizationSchema.parse({
    id: 'c79cb3ba-745e-5d9a-8903-4a02327a7e06',
    name: 'Ministère de la Transition écologique',
    acronym: null,
    level: 3,
    directoryUrl: null,
    isTerritorial: false,
    ancestors: [centralAdministration, government],
  }),
  InitiativeOrganizationSchema.parse({
    id: 'c79cb3ba-745e-5d9a-8903-4a02327a7e07',
    name: 'Mairie - Plouhinec',
    acronym: null,
    level: 1,
    directoryUrl: null,
    isTerritorial: false,
    ancestors: [],
  }),
];

export const organizationOptions: OrganizationOptionSchemaType[] = [
  OrganizationOptionSchema.parse({ ...ministry, level: 3, initiativesCount: 1274, ancestors: [centralAdministration, government] }),
  OrganizationOptionSchema.parse({ ...dinum, level: 4, initiativesCount: 1201, ancestors: [centralAdministration, government, ministry] }),
  OrganizationOptionSchema.parse({
    id: organizations[2].id,
    name: organizations[2].name,
    acronym: organizations[2].acronym,
    level: organizations[2].level,
    initiativesCount: 3,
    ancestors: [],
  }),
];

export const domainsReputation: DomainReputationSchemaType[] = [
  {
    domain: 'great-project.local',
    rank: 62,
    relativeReputation: 95,
    backlinks: 45039,
    referringPages: 43731,
    referringDomains: 2760,
    referringDomainsNofollow: 1544,
    referringMainDomains: 1931,
    referringIps: 1347,
    backlinksSpamScore: 17,
    brokenBacklinks: 543,
    brokenPages: 38,
    firstSeenAt: new Date('January 16, 2019 04:11:05 UTC'),
    lastCheckAt: new Date('November 6, 2026 14:00:00 UTC'),
    linksSemanticLocations: { footer: 20251, section: 13079, '': 3515, main: 2645, nav: 2305, article: 1721 },
    linksTypes: { anchor: 41983, image: 1739, redirect: 9 },
    linksPlatformTypes: { unknown: 41207, blogs: 1500, cms: 1495, organization: 1174, news: 228 },
    linksCountries: { FR: 37222, '': 4943, IO: 450, IT: 373 },
    linksTopLevelDomains: { 'gouv.fr': 21323, fr: 15231, online: 1815, com: 1500 },
    httpSecurityGrade: 'B',
    tlsLevel: 1,
    tlsIssues: ['legacy_tls'],
    usesMail: true,
    mailSecurityLevel: 1,
    mailIssues: ['dmarc_missing'],
    hasLegalNotice: true,
    hasPrivacyPolicy: false,
    foreignDependencyLevel: 1,
    foreignDependencies: ['Services tiers : Google'],
  },
  {
    domain: 'docs.great-project.local',
    rank: null,
    relativeReputation: null,
    backlinks: null,
    referringPages: null,
    referringDomains: null,
    referringDomainsNofollow: null,
    referringMainDomains: null,
    referringIps: null,
    backlinksSpamScore: null,
    brokenBacklinks: null,
    brokenPages: null,
    firstSeenAt: null,
    lastCheckAt: new Date('November 6, 2026 14:00:00 UTC'),
    linksSemanticLocations: null,
    linksTypes: null,
    linksPlatformTypes: null,
    linksCountries: null,
    linksTopLevelDomains: null,
    httpSecurityGrade: null,
    tlsLevel: null,
    tlsIssues: [],
    usesMail: null,
    mailSecurityLevel: null,
    mailIssues: [],
    hasLegalNotice: null,
    hasPrivacyPolicy: null,
    foreignDependencyLevel: null,
    foreignDependencies: [],
  },
];

export const initiatives: InitiativeSchemaType[] = [
  InitiativeSchema.parse({
    id: 'b79cb3ba-745e-5d9a-8903-4a02327a7e01',
    name: 'Great project',
    description:
      'Nostrum nostrum provident sunt rem quidem quo ut quia. Et autem laboriosam quis provident culpa quo. Dicta perspiciatis nihil. Dolor cupiditate vel iste ullam possimus voluptatem tenetur omnis non. Possimus rerum labore tempore commodi. Dolores illum recusandae et expedita cupiditate qui.',
    websites: ['https://great-project.local', 'https://docs.great-project.local'],
    repositories: ['https://github.local/organization/great-project-app', 'https://github.local/organization/great-project-docs'],
    businessUseCases: ['Accusantium vel enim', 'Qui illo nesciunt'],
    functionalUseCases: [FunctionalUseCaseSchema.enum.GENERATES_PDF, FunctionalUseCaseSchema.enum.SENDS_EMAILS],
    tools: ['Next.js', 'JavaScript', 'PostgreSQL'],
    organizations: [organizations[0], organizations[1]],
    reputationRank: 62,
    repositoryStars: 1234,
    relativeReputation: 80,
    createdAt: new Date('December 17, 2022 03:24:00 UTC'),
    computedAt: new Date('December 19, 2022 04:33:00 UTC'),
    updatedAt: new Date('December 19, 2022 04:33:00 UTC'),
    deletedAt: null,
  }),
  InitiativeSchema.parse({
    id: 'b79cb3ba-745e-5d9a-8903-4a02327a7e02',
    name: 'project-api',
    description:
      'Rerum unde quia deserunt ea quia labore eum et. Accusantium et quidem nobis reiciendis quia doloremque nulla a modi. At quis voluptate deleniti magni itaque aut in. Eum deserunt labore accusantium hic dolores vitae enim saepe. Consequuntur dolor aliquid expedita iste consequatur esse. Dolor vitae quia nam ea officia.',
    websites: [],
    repositories: ['https://github.local/organization/project-api'],
    businessUseCases: ['Sint nam est nihil expedita eligendi minima asperiores aut asperiores', 'Rerum quod dicta'],
    functionalUseCases: [FunctionalUseCaseSchema.enum.SENDS_EMAILS, FunctionalUseCaseSchema.enum.HAS_VIRTUAL_EMAIL_INBOXES],
    tools: ['Ruby', 'Brevo', 'Sentry'],
    organizations: [organizations[0]],
    reputationRank: null,
    repositoryStars: null,
    relativeReputation: null,
    createdAt: new Date('December 17, 2022 03:24:00 UTC'),
    computedAt: new Date('December 19, 2022 04:33:00 UTC'),
    updatedAt: new Date('December 19, 2022 04:33:00 UTC'),
    deletedAt: null,
  }),
  InitiativeSchema.parse({
    id: 'b79cb3ba-745e-5d9a-8903-4a02327a7e03',
    name: 'service-public.fr',
    description:
      'Temporibus maiores aspernatur a quo rerum illum voluptates ut minima. Aliquid maiores totam. Omnis doloremque accusamus et et voluptas tempora aut. Quo aut excepturi impedit iure ex error.',
    websites: ['https://service-public.fr'],
    repositories: [],
    businessUseCases: ['Non est illum', 'Et rerum culpa quis animi'],
    functionalUseCases: [FunctionalUseCaseSchema.enum.SENDS_EMAILS],
    tools: ['Python', 'Django', 'React', 'Matomo'],
    organizations: [],
    reputationRank: null,
    repositoryStars: null,
    relativeReputation: null,
    createdAt: new Date('December 17, 2022 03:24:00 UTC'),
    computedAt: new Date('December 19, 2022 04:33:00 UTC'),
    updatedAt: new Date('December 19, 2022 04:33:00 UTC'),
    deletedAt: null,
  }),
];

// A tiny directory for the organizations map
const noInitiatives = { websitesOnly: 0, repositoriesOnly: 0, both: 0 };
const noDistribution = { reputation: [3, 12, 20, 8, 1, 4], foreign: [10, 15, 0, 6, 4, 13], legal: [9, 0, 0, 0, 32, 7] };
const asItem = (
  organization: { id: string; name: string; acronym: string | null },
  parentId: string | null,
  level: number,
  composition: typeof noInitiatives,
  own: typeof noInitiatives,
  isHierarchyRoot = false
) => ({
  id: organization.id,
  parentId: parentId,
  name: organization.name,
  acronym: organization.acronym,
  level: level,
  isHierarchyRoot: isHierarchyRoot,
  isTerritorial: false,
  composition: composition,
  own: own,
  ownWeights: own,
  relativeReputation: 48,
  averageForeignDependencyLevel: 1.5,
  legalNoticeShare: 78,
  distribution: noDistribution,
});

export const organizationsMap: OrganizationsMapSchemaType = OrganizationsMapSchema.parse({
  organizations: [
    asItem(centralAdministration, null, 1, { websitesOnly: 118, repositoriesOnly: 498, both: 59 }, noInitiatives, true),
    asItem(government, centralAdministration.id, 2, { websitesOnly: 118, repositoriesOnly: 498, both: 59 }, noInitiatives),
    asItem(ministry, government.id, 3, { websitesOnly: 108, repositoriesOnly: 492, both: 59 }, { websitesOnly: 30, repositoriesOnly: 12, both: 2 }),
    asItem(dinum, ministry.id, 4, { websitesOnly: 78, repositoriesOnly: 480, both: 57 }, { websitesOnly: 18, repositoriesOnly: 40, both: 5 }),
    asItem(
      organizations[0],
      dinum.id,
      5,
      { websitesOnly: 60, repositoriesOnly: 440, both: 52 },
      { websitesOnly: 60, repositoriesOnly: 440, both: 52 }
    ),
    asItem(
      organizations[1],
      government.id,
      3,
      { websitesOnly: 10, repositoriesOnly: 6, both: 0 },
      { websitesOnly: 10, repositoriesOnly: 6, both: 0 }
    ),
    asItem(organizations[2], null, 1, { websitesOnly: 3, repositoriesOnly: 0, both: 0 }, { websitesOnly: 3, repositoriesOnly: 0, both: 0 }),
  ],
  composition: { websitesOnly: 241, repositoriesOnly: 538, both: 61 },
  standalone: { websitesOnly: 3, repositoriesOnly: 0, both: 0 },
  unclassified: { websitesOnly: 120, repositoriesOnly: 40, both: 2 },
  distribution: noDistribution,
  standaloneDistribution: noDistribution,
  unclassifiedDistribution: noDistribution,
});
