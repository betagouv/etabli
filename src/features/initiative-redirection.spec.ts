/**
 * @jest-environment node
 */
import { softRemoveReplacedOrphanInitiatives } from '@etabli/src/features/initiative-redirection';
import { TestDatabase, setupTestDatabase, teardownTestDatabase } from '@etabli/src/utils/database';

describe('softRemoveReplacedOrphanInitiatives()', () => {
  let database: TestDatabase | null = null;

  beforeAll(async () => {
    database = await setupTestDatabase();
  }, 60 * 1000);

  afterAll(async () => {
    await teardownTestDatabase(database);
  }, 30 * 1000);

  it('should only remove the orphans whose addresses are described elsewhere or gone', async () => {
    const prisma = database!.prisma;

    await prisma.rawDomain.createMany({
      data: [
        { name: 'www.replaced.gouv.fr', siren: '1', sources: 'test' },
        { name: 'waiting.gouv.fr', siren: '1', sources: 'test' },
        { name: 'with-path.gouv.fr', siren: '1', sources: 'test' },
      ],
    });
    await prisma.rawRepository.create({
      data: {
        name: 'replaced',
        organizationName: 'forge',
        platform: 'GITHUB',
        repositoryUrl: 'https://github.com/forge/replaced',
        defaultBranch: 'main',
        isArchived: false,
        creationDate: new Date('2024-01-01'),
        lastUpdate: new Date('2024-01-01'),
        lastModification: new Date('2024-01-01'),
        starsCount: 0,
        forksCount: 0,
        openIssuesCount: 0,
        repositoryDomain: 'github.com',
      },
    });

    const map = await prisma.initiativeMap.create({ data: { mainItemIdentifier: '00000000-0000-4000-8000-000000000001', update: false } });
    const replacement = await prisma.initiative.create({
      data: {
        name: 'Replacement',
        description: 'new sheet',
        websites: ['https://replaced.gouv.fr', 'https://with-path.gouv.fr'],
        repositories: ['https://github.com/forge/replaced'],
        originId: map.id,
      },
    });

    const replacedOrphan = await prisma.initiative.create({
      data: {
        name: 'Replaced',
        description: 'old sheet',
        websites: ['https://www.replaced.gouv.fr/'],
        repositories: ['https://github.com/forge/replaced'],
      },
    });
    const waitingOrphan = await prisma.initiative.create({
      data: { name: 'Waiting', description: 'old sheet', websites: ['https://waiting.gouv.fr', 'https://replaced.gouv.fr'] },
    });
    const goneOrphan = await prisma.initiative.create({
      data: { name: 'Gone', description: 'old sheet', repositories: ['https://github.com/forge/deleted'] },
    });
    const pageOrphan = await prisma.initiative.create({
      data: { name: 'Page', description: 'old sheet', websites: ['https://with-path.gouv.fr/application'] },
    });

    await expect(softRemoveReplacedOrphanInitiatives(prisma)).resolves.toBe(3);

    const initiatives = await prisma.initiative.findMany({ select: { id: true, deletedAt: true } });
    const removedIds = initiatives.filter((initiative) => !!initiative.deletedAt).map((initiative) => initiative.id);

    expect(removedIds.sort()).toEqual([replacedOrphan.id, goneOrphan.id, pageOrphan.id].sort());
    expect(removedIds).not.toContain(waitingOrphan.id);
    expect(removedIds).not.toContain(replacement.id);

    const redirections = await prisma.initiativeRedirection.findMany({ select: { fromInitiativeId: true, toInitiativeId: true } });

    expect(redirections).toEqual(
      expect.arrayContaining([
        { fromInitiativeId: replacedOrphan.id, toInitiativeId: replacement.id },
        { fromInitiativeId: pageOrphan.id, toInitiativeId: replacement.id },
      ])
    );
    expect(redirections.map((redirection) => redirection.fromInitiativeId)).not.toContain(goneOrphan.id);

    // Running it again changes nothing
    await expect(softRemoveReplacedOrphanInitiatives(prisma)).resolves.toBe(0);
  });
});
