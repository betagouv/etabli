import { InitiativeSchema, InitiativeSchemaType } from '@etabli/src/models/entities/initiative';

export const authorities: InitiativeSchemaType[] = [
  InitiativeSchema.parse({
    id: 'b79cb3ba-745e-5d9a-8903-4a02327a7e01',
    name: 'Great project',
    description:
      'Nostrum nostrum provident sunt rem quidem quo ut quia. Et autem laboriosam quis provident culpa quo. Dicta perspiciatis nihil. Dolor cupiditate vel iste ullam possimus voluptatem tenetur omnis non. Possimus rerum labore tempore commodi. Dolores illum recusandae et expedita cupiditate qui.',
    websites: [], // TODO
    repositories: [], // TODO
    createdAt: new Date('December 17, 2022 03:24:00 UTC'),
    updatedAt: new Date('December 19, 2022 04:33:00 UTC'),
    deletedAt: null,
  }),
  InitiativeSchema.parse({
    id: 'b79cb3ba-745e-5d9a-8903-4a02327a7e02',
    name: 'project-api',
    description:
      'Rerum unde quia deserunt ea quia labore eum et. Accusantium et quidem nobis reiciendis quia doloremque nulla a modi. At quis voluptate deleniti magni itaque aut in. Eum deserunt labore accusantium hic dolores vitae enim saepe. Consequuntur dolor aliquid expedita iste consequatur esse. Dolor vitae quia nam ea officia.',
    websites: [], // TODO
    repositories: [], // TODO
    createdAt: new Date('December 17, 2022 03:24:00 UTC'),
    updatedAt: new Date('December 19, 2022 04:33:00 UTC'),
    deletedAt: null,
  }),
  InitiativeSchema.parse({
    id: 'b79cb3ba-745e-5d9a-8903-4a02327a7e03',
    name: 'service-public.fr',
    description:
      'Temporibus maiores aspernatur a quo rerum illum voluptates ut minima. Aliquid maiores totam. Omnis doloremque accusamus et et voluptas tempora aut. Quo aut excepturi impedit iure ex error.',
    websites: [], // TODO
    repositories: [], // TODO
    createdAt: new Date('December 17, 2022 03:24:00 UTC'),
    updatedAt: new Date('December 19, 2022 04:33:00 UTC'),
    deletedAt: null,
  }),
];
