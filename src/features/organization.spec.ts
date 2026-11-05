/**
 * @jest-environment node
 */
import concurrently from 'concurrently';
import { randomUUID } from 'crypto';

import type { LiteOrganizationSchemaType } from '@etabli/src/models/entities/organization';
import { PostgresContainer, setupPostgres } from '@etabli/src/utils/database';

// [IMPORTANT] Modules using the database must only be imported dynamically from `beforeAll`: the connection pool reads `DATABASE_URL`
// when imported, so a static import would make these tests run on the database of the developer instead of the container
type OrganizationModule = typeof import('@etabli/src/features/organization');
type FiltersModule = typeof import('@etabli/src/server/routers/common/initiative-filters');
type RouterModule = typeof import('@etabli/src/server/routers/organization');
type PrismaModule = typeof import('@etabli/src/prisma');

function liteOrganization(name: string, parent?: LiteOrganizationSchemaType): LiteOrganizationSchemaType {
  return {
    dilaId: randomUUID(),
    parentDilaId: parent?.dilaId ?? null,
    ancestorDilaIds: parent ? [...parent.ancestorDilaIds, parent.dilaId] : [],
    level: parent ? parent.level + 1 : 1,
    name: name,
    acronym: null,
    domains: [],
    directoryUrl: null,
    localServiceType: null,
    isTerritorial: false,
  };
}

function toMap(organizations: LiteOrganizationSchemaType[]): Map<string, LiteOrganizationSchemaType> {
  return new Map(organizations.map((organization) => [organization.dilaId, organization]));
}

describe('organizations', () => {
  let postgres: PostgresContainer;
  let organizationModule: OrganizationModule;
  let filtersModule: FiltersModule;
  let routerModule: RouterModule;
  let prisma: PrismaModule['prisma'];

  beforeAll(async () => {
    postgres = await setupPostgres();
    process.env.DATABASE_URL = postgres.url;

    prisma = (await import('@etabli/src/prisma')).prisma;
    organizationModule = await import('@etabli/src/features/organization');
    filtersModule = await import('@etabli/src/server/routers/common/initiative-filters');
    routerModule = await import('@etabli/src/server/routers/organization');

    await prisma.$executeRaw`CREATE EXTENSION IF NOT EXISTS "vector";`;
    await prisma.$executeRaw`CREATE EXTENSION IF NOT EXISTS "uuid-ossp";`;
    await prisma.$executeRaw`CREATE EXTENSION IF NOT EXISTS "pgcrypto";`;
    await prisma.$executeRaw`CREATE EXTENSION IF NOT EXISTS "unaccent";`;

    await concurrently(['npm:db:push:unsecure']).result;
  }, 60 * 1000);

  afterAll(async () => {
    if (prisma) {
      await prisma.$disconnect();
    }

    // The client does not own the pool, it must be closed before the database stops or its connections would throw
    await (await import('@etabli/src/prisma/pool')).dbPool.end();

    if (postgres) {
      await postgres.container.stop();
    }
  }, 30 * 1000);

  beforeEach(async () => {
    await prisma.initiative.deleteMany();
    await prisma.organization.deleteMany();
  });

  const createInitiative = (name: string, websites: string[] = [], repositories: string[] = []) =>
    prisma.initiative.create({
      data: { name: name, description: name, websites: websites, repositories: repositories, functionalUseCases: [] },
    });

  const bind = async (initiativeId: string, dilaId: string) => {
    const organization = await prisma.organization.findUniqueOrThrow({ where: { dilaId: dilaId } });

    await prisma.organizationsOnInitiatives.create({ data: { initiativeId: initiativeId, organizationId: organization.id } });
    await organizationModule.updateOrganizationsInitiativesCount();

    return organization;
  };

  const makeOld = (initiativeId: string) => prisma.initiative.update({ where: { id: initiativeId }, data: { updatedAt: new Date(0) } });

  const getUpdatedAt = async (initiativeId: string) =>
    (await prisma.initiative.findUniqueOrThrow({ where: { id: initiativeId }, select: { updatedAt: true } })).updatedAt.getTime();

  const callRouter = () => routerModule.organizationRouter.createCaller({ type: 'api', user: null });

  describe('parseOrganizations()', () => {
    const validRecord = () => ({ id: randomUUID(), nom: 'Mairie' });

    it('should refuse a directory whose format changed instead of emptying the organizations', () => {
      expect(() => organizationModule.parseOrganizations([{ identifier: randomUUID() }, { identifier: randomUUID() }])).toThrow();
      expect(() => organizationModule.parseOrganizations([])).toThrow();
    });

    it('should skip a few malformed records', () => {
      const records = [...Array.from({ length: 20 }, validRecord), { id: 'not-a-uuid', nom: 'Mairie' }];

      expect(organizationModule.parseOrganizations(records).size).toBe(20);
    });

    it('should not keep a directory link that is not a web page', () => {
      const record = { ...validRecord(), url_service_public: 'javascript:alert(1)' };

      expect(organizationModule.parseOrganizations([record]).get(record.id)?.directoryUrl).toBeNull();
    });
  });

  describe('synchronizeOrganizations()', () => {
    it('should not touch anything when too many organizations would be removed', async () => {
      const organizations = Array.from({ length: 20 }, (_, index) => liteOrganization(`Organization ${index}`));
      await organizationModule.synchronizeOrganizations(toMap(organizations));

      const initiative = await createInitiative('initiative');
      await bind(initiative.id, organizations[0].dilaId);

      await expect(organizationModule.synchronizeOrganizations(toMap(organizations.slice(0, 5)))).rejects.toThrow();

      expect(await prisma.organization.count()).toBe(20);
      expect(await prisma.organizationsOnInitiatives.count()).toBe(1);
    });

    it('should mark as updated an initiative losing its organization so its LLM document is computed again', async () => {
      const organizations = Array.from({ length: 20 }, (_, index) => liteOrganization(`Organization ${index}`));
      await organizationModule.synchronizeOrganizations(toMap(organizations));

      const initiative = await createInitiative('initiative');
      const untouchedInitiative = await createInitiative('untouched');
      await bind(initiative.id, organizations[0].dilaId);
      await makeOld(initiative.id);
      await makeOld(untouchedInitiative.id);

      await organizationModule.synchronizeOrganizations(toMap(organizations.slice(1)));

      expect(await prisma.organizationsOnInitiatives.count()).toBe(0);
      expect(await getUpdatedAt(initiative.id)).toBeGreaterThan(0);
      expect(await getUpdatedAt(untouchedInitiative.id)).toBe(0);
    });

    it('should mark as updated initiatives under a renamed organization', async () => {
      const ministry = liteOrganization('Ministry');
      const direction = liteOrganization('Direction', ministry);
      await organizationModule.synchronizeOrganizations(toMap([ministry, direction]));

      const initiative = await createInitiative('initiative');
      await bind(initiative.id, direction.dilaId);
      await makeOld(initiative.id);

      await organizationModule.synchronizeOrganizations(toMap([{ ...ministry, name: 'Renamed ministry' }, direction]));

      expect(await getUpdatedAt(initiative.id)).toBeGreaterThan(0);
    });
  });

  describe('filters', () => {
    it('should bring initiatives of descendants and support unclassified ones', async () => {
      const ministry = liteOrganization('Ministry');
      const direction = liteOrganization('Direction', ministry);
      const other = liteOrganization('Other');
      await organizationModule.synchronizeOrganizations(toMap([ministry, direction, other]));

      const underDirection = await createInitiative('under direction');
      const underOther = await createInitiative('under other');
      const unclassified = await createInitiative('unclassified');
      const { id: ministryId } = await bind(underDirection.id, direction.dilaId).then(() =>
        prisma.organization.findUniqueOrThrow({ where: { dilaId: ministry.dilaId } })
      );
      const { id: otherId } = await bind(underOther.id, other.dilaId);

      const filterBy = { query: null };

      expect(await filtersModule.retrieveFilteredInitiativesIds(filterBy)).toBeNull();
      expect(await filtersModule.retrieveFilteredInitiativesIds({ ...filterBy, organizationIds: [ministryId] })).toStrictEqual([underDirection.id]);
      expect(await filtersModule.retrieveFilteredInitiativesIds({ ...filterBy, unclassified: true })).toStrictEqual([unclassified.id]);
      expect(
        (await filtersModule.retrieveFilteredInitiativesIds({ ...filterBy, organizationIds: [otherId], unclassified: true }))?.sort()
      ).toStrictEqual([underOther.id, unclassified.id].sort());
    });
  });

  describe('getOrganizationsMap()', () => {
    it('should not serve a stale map when what an initiative is made of changes', async () => {
      const organization = liteOrganization('Organization');
      await organizationModule.synchronizeOrganizations(toMap([organization]));

      const initiative = await createInitiative('initiative', ['https://example.com/']);
      await bind(initiative.id, organization.dilaId);

      const before = await callRouter().getOrganizationsMap({ filterBy: { query: null } });
      expect(before.composition).toStrictEqual({ websitesOnly: 1, repositoriesOnly: 0, both: 0 });

      await prisma.initiative.update({ where: { id: initiative.id }, data: { repositories: ['https://example.com/repository'] } });

      const after = await callRouter().getOrganizationsMap({ filterBy: { query: null } });
      expect(after.composition).toStrictEqual({ websitesOnly: 0, repositoriesOnly: 0, both: 1 });
    });

    it('should scope the map to filtered organizations without bringing their co-owners', async () => {
      const first = liteOrganization('First');
      const second = liteOrganization('Second');
      await organizationModule.synchronizeOrganizations(toMap([first, second]));

      const initiative = await createInitiative('initiative', ['https://example.com/']);
      const { id: firstId } = await bind(initiative.id, first.dilaId);
      await bind(initiative.id, second.dilaId);

      const map = await callRouter().getOrganizationsMap({ filterBy: { query: null, organizationIds: [firstId] } });

      expect(map.organizations.map((item) => item.id)).toStrictEqual([firstId]);
      expect(map.organizations[0].ownWeights.websitesOnly).toBe(1);
    });
  });

  describe('searchOrganizations()', () => {
    it('should ignore accents and treat LIKE wildcards as text', async () => {
      const organization = { ...liteOrganization('Ministère de la Santé') };
      await organizationModule.synchronizeOrganizations(toMap([organization]));

      const initiative = await createInitiative('initiative');
      const { id: organizationId } = await bind(initiative.id, organization.dilaId);

      expect((await callRouter().searchOrganizations({ query: 'ministere sante' })).organizations.map((item) => item.id)).toStrictEqual([
        organizationId,
      ]);
      expect((await callRouter().searchOrganizations({ query: '%' })).organizations).toStrictEqual([]);
    });
  });
});
