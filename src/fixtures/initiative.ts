import { FunctionalUseCaseSchema, InitiativeSchema, InitiativeSchemaType } from '@etabli/src/models/entities/initiative';

export const initiatives: InitiativeSchemaType[] = [
  InitiativeSchema.parse({
    id: 'b79cb3ba-745e-5d9a-8903-4a02327a7e01',
    name: 'Great project',
    description:
      'Nostrum nostrum provident sunt rem quidem quo ut quia. Et autem laboriosam quis provident culpa quo. Dicta perspiciatis nihil. Dolor cupiditate vel iste ullam possimus voluptatem tenetur omnis non. Possimus rerum labore tempore commodi. Dolores illum recusandae et expedita cupiditate qui.',
    websites: ['https://great-project.local', 'https://docs.great-project.local'],
    repositories: ['https://github.local/organization/great-project-app', 'https://github.local/organization/great-project-docs'],
    businessUseCases: ['Accusantium vel enim', 'Qui illo nesciunt'],
    functionalUseCases: [FunctionalUseCaseSchema.Values.GENERATES_PDF, FunctionalUseCaseSchema.Values.SENDS_EMAILS],
    tools: ['Next.js', 'JavaScript', 'PostgreSQL'],
    createdAt: new Date('December 17, 2022 03:24:00 UTC'),
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
    functionalUseCases: [FunctionalUseCaseSchema.Values.SENDS_EMAILS, FunctionalUseCaseSchema.Values.HAS_VIRTUAL_EMAIL_INBOXES],
    tools: ['Ruby', 'Brevo', 'Sentry'],
    createdAt: new Date('December 17, 2022 03:24:00 UTC'),
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
    functionalUseCases: [FunctionalUseCaseSchema.Values.SENDS_EMAILS],
    tools: ['Python', 'Django', 'React', 'Matomo'],
    createdAt: new Date('December 17, 2022 03:24:00 UTC'),
    updatedAt: new Date('December 19, 2022 04:33:00 UTC'),
    deletedAt: null,
  }),
];
