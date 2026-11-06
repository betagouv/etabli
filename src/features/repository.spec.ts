/**
 * @jest-environment node
 */
import {
  EcosystemRepositorySchemaType,
  JsonRepositorySchemaType,
  getRepositoryNameWithSubgroups,
  isLikelyStudentRepository,
  isMeaningfulRepositoryChange,
  mergeRepositoryLists,
  stripMultirepositoriesPatterns,
} from '@etabli/src/features/repository';

describe('stripMultirepositoriesPatterns()', () => {
  it('should confirm it can be indexed', async () => {
    expect(stripMultirepositoriesPatterns('project-name-api')).toBe('project-name');
    expect(stripMultirepositoriesPatterns('project-name-api-suffix')).toBe('project-name-suffix');
    expect(stripMultirepositoriesPatterns('-project-name-')).toBe('project-name');
    expect(stripMultirepositoriesPatterns('project-name-v6')).toBe('project-name');
    expect(stripMultirepositoriesPatterns('project-name-v185-app')).toBe('project-name');
    expect(stripMultirepositoriesPatterns('project.name.api')).toBe('project.name');
    expect(stripMultirepositoriesPatterns('project-name-api-backoffice')).toBe('project-name');
    expect(stripMultirepositoriesPatterns('project-name-api-hello')).toBe('project-name-hello');
    expect(stripMultirepositoriesPatterns('api-project-name')).toBe('project-name');
    expect(stripMultirepositoriesPatterns('api-project-name')).toBe('project-name');
    expect(stripMultirepositoriesPatterns('project-name/api')).toBe('project-name/');
    expect(stripMultirepositoriesPatterns('subproject/backend-project-name/api')).toBe('subproject/project-name/');
  });
});

describe('getRepositoryNameWithSubgroups()', () => {
  it('should return the right part', async () => {
    expect(getRepositoryNameWithSubgroups('https://github.com/organization-a/project-b')).toBe('project-b');
    expect(getRepositoryNameWithSubgroups('https://gitlab.com/organization-b/mysubgroup/hello-backend')).toBe('mysubgroup/hello-backend');
  });
});

describe('isLikelyStudentRepository()', () => {
  const repository = {
    repositoryUrl: 'https://forge.univ-lyon1.fr/group/game',
    starsCount: 0,
    forksCount: 0,
    homepage: null,
    creationDate: new Date('2021-02-09'),
    lastModification: new Date('2021-07-16'),
  };

  it('should detect a short-lived repository without interest on a school forge', () => {
    expect(isLikelyStudentRepository(repository)).toBe(true);
  });

  it('should keep what shows some life or comes from elsewhere', () => {
    expect(isLikelyStudentRepository({ ...repository, starsCount: 1 })).toBe(false);
    expect(isLikelyStudentRepository({ ...repository, homepage: 'https://game.fr' })).toBe(false);
    expect(isLikelyStudentRepository({ ...repository, lastModification: new Date('2023-01-01') })).toBe(false);
    expect(isLikelyStudentRepository({ ...repository, repositoryUrl: 'https://github.com/betagouv/game' })).toBe(false);
  });
});

describe('mergeRepositoryLists()', () => {
  const frozen: JsonRepositorySchemaType = {
    id: 1,
    name: 'app',
    organization_name: 'forge',
    platform: 'GitLab',
    repository_url: 'https://gitlab.example.fr/Forge/app',
    description: 'frozen',
    default_branch: 'main',
    is_fork: null,
    is_archived: true,
    creation_date: new Date('2020-01-01'),
    last_update: new Date('2024-11-01'),
    last_modification: new Date('2024-11-01'),
    homepage: null,
    stars_count: 0,
    forks_count: 0,
    license: null,
    open_issues_count: 0,
    language: null,
    topics: null,
    software_heritage_exists: true,
    software_heritage_url: 'https://archive.softwareheritage.org/app',
  };
  const ecosystem: EcosystemRepositorySchemaType = {
    id: 2,
    html_url: 'https://gitlab.example.fr/forge/group/app',
    owner: 'forge',
    kind: 'gitlab',
    description: 'ecosystem',
    default_branch: 'main',
    fork: false,
    archived: null,
    created_at: new Date('2020-01-01'),
    updated_at: new Date('2026-01-01'),
    pushed_at: null,
    homepage: 'not an url',
    stargazers_count: null,
    forks_count: null,
    license: 'mit',
    open_issues_count: null,
    language: null,
    topics: ['a', 'b'],
  };

  it('should keep repositories known by only one list', async () => {
    const merged = mergeRepositoryLists([frozen], [ecosystem]);

    expect(merged.map((repository) => repository.repository_url)).toEqual([frozen.repository_url, ecosystem.html_url]);
    expect(merged[1]).toMatchObject({
      name: 'app',
      organization_name: 'forge',
      platform: 'GitLab',
      is_fork: null,
      is_archived: false,
      last_modification: ecosystem.updated_at,
      homepage: null,
      topics: 'a,b',
    });
  });

  it('should use the most recent information while keeping what only the frozen list has', async () => {
    const sameRepository = { ...ecosystem, html_url: 'https://gitlab.example.fr/forge/app.git' };

    expect(mergeRepositoryLists([frozen], [sameRepository])).toEqual([
      expect.objectContaining({
        description: 'ecosystem',
        repository_url: frozen.repository_url,
        is_archived: true,
        software_heritage_exists: true,
        software_heritage_url: frozen.software_heritage_url,
      }),
    ]);

    expect(mergeRepositoryLists([frozen], [{ ...sameRepository, updated_at: new Date('2024-05-01') }])).toEqual([frozen]);
  });

  it('should ignore a repository without default branch while keeping the known version', async () => {
    const emptyRepository = { ...ecosystem, default_branch: null };

    expect(mergeRepositoryLists([], [emptyRepository])).toEqual([]);
    expect(mergeRepositoryLists([frozen], [{ ...emptyRepository, html_url: frozen.repository_url }])).toEqual([frozen]);
  });

  it('should keep the fork information of GitHub only when not set', async () => {
    const github = { ...ecosystem, kind: 'github', html_url: 'https://github.com/forge/app' };

    expect(mergeRepositoryLists([], [github])[0]).toMatchObject({ platform: 'GitHub', is_fork: false });
    expect(mergeRepositoryLists([], [{ ...ecosystem, fork: true }])[0].is_fork).toBe(true);
  });
});

describe('mergeRepositoryLists() with the last inventory', () => {
  const inventoryRepository = {
    id: 'https://github.com/forge/inventory-only',
    owner: 'https://github.com/forge',
    platform: 'github.com',
    description: null,
    fork: false,
    archived: false,
    updated_at: new Date('2025-09-01'),
    forks_count: 1,
    license: '',
    language: '',
  };

  it('should only add unknown repositories', async () => {
    const merged = mergeRepositoryLists([], [], [inventoryRepository]);

    expect(merged).toEqual([
      expect.objectContaining({
        name: 'inventory-only',
        organization_name: 'forge',
        platform: 'GitHub',
        default_branch: 'main',
        repository_url: inventoryRepository.id,
      }),
    ]);

    expect(mergeRepositoryLists(merged, [], [{ ...inventoryRepository, description: 'other' }])).toEqual(merged);
  });

  it('should not bring back an empty repository', async () => {
    const emptyRepository = {
      id: 2,
      html_url: inventoryRepository.id,
      owner: 'forge',
      kind: 'github',
      description: null,
      default_branch: null,
      fork: false,
      archived: false,
      created_at: new Date('2025-01-01'),
      updated_at: new Date('2025-01-01'),
      pushed_at: null,
      homepage: null,
      stargazers_count: null,
      forks_count: null,
      license: null,
      open_issues_count: null,
      language: null,
      topics: [],
    };

    expect(mergeRepositoryLists([], [emptyRepository], [inventoryRepository])).toEqual([]);
  });
});

describe('isMeaningfulRepositoryChange()', () => {
  const repository = {
    name: 'app',
    description: 'description',
    homepage: null,
    isArchived: false,
    defaultBranch: 'main',
    lastModification: new Date('2026-01-01'),
    lastUpdate: new Date('2026-01-01'),
    starsCount: 1,
  } as Parameters<typeof isMeaningfulRepositoryChange>[0];

  it('should ignore counters and the update date', async () => {
    expect(isMeaningfulRepositoryChange(repository, { ...repository, starsCount: 2, lastUpdate: new Date('2026-02-01') })).toBe(false);
    expect(isMeaningfulRepositoryChange(repository, { ...repository, lastModification: new Date('2026-01-01') })).toBe(false);
  });

  it('should detect what an initiative sheet is based on', async () => {
    expect(isMeaningfulRepositoryChange(repository, { ...repository, description: 'other' })).toBe(true);
    expect(isMeaningfulRepositoryChange(repository, { ...repository, lastModification: new Date('2026-02-01') })).toBe(true);
  });
});
