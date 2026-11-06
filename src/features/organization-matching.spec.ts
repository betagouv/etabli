/**
 * @jest-environment node
 */
import {
  MatchableOrganization,
  OrganizationMatcher,
  assertSafeOrganizationsRemoval,
  assertUsableOrganizationsDirectory,
  extractOrganizationDomain,
  getRegistrableDomain,
  getWebsiteOwnerPriority,
  normalizeHostname,
  normalizeRepositoryUrl,
} from '@etabli/src/features/organization-matching';

// A small tree mimicking the DILA directory:
//
// central (L1)
// └── government (L2)
//     ├── ministryA (L3) [ministry-a.gouv.fr]
//     │   └── directionA (L4) [ministry-a.gouv.fr, direction-a.gouv.fr]
//     │       └── teamA (L5) [beta.gouv.fr]
//     ├── ministryB (L3) [shared-ministries.gouv.fr]
//     └── ministryC (L3) [shared-ministries.gouv.fr]
//         ├── directionC1 (L4) [sante.gouv.fr]
//         └── directionC2 (L4) [sante.gouv.fr]
// courtX, courtY (L1, standalone) [ministry-a.gouv.fr]
// brigade1..3 (L1, standalone) [network.interieur.gouv.fr]
// townHall, socialCenter (L1, standalone) [ville.fr]
// ministryOfInterior (L3, under government) [interieur.gouv.fr]
function organization(
  id: string,
  ancestorIds: string[],
  domains: string[],
  hasChildren = false,
  websiteOwnerPriority: number | null = null
): MatchableOrganization {
  return { id, ancestorIds, level: ancestorIds.length + 1, hasChildren, domains, websiteOwnerPriority };
}

const townHallPriority = getWebsiteOwnerPriority({ name: 'Mairie - Ville', localServiceType: 'mairie' });
const intermunicipalityPriority = getWebsiteOwnerPriority({ name: 'Communauté de communes', localServiceType: 'epci' });

const organizations: MatchableOrganization[] = [
  organization('central', [], [], true),
  organization('government', ['central'], [], true),
  organization('ministryA', ['central', 'government'], ['ministry-a.gouv.fr'], true),
  organization('directionA', ['central', 'government', 'ministryA'], ['ministry-a.gouv.fr', 'direction-a.gouv.fr'], true),
  organization('teamA', ['central', 'government', 'ministryA', 'directionA'], ['beta.gouv.fr']),
  organization('ministryB', ['central', 'government'], ['shared-ministries.gouv.fr']),
  organization('ministryC', ['central', 'government'], ['shared-ministries.gouv.fr'], true),
  organization('directionC1', ['central', 'government', 'ministryC'], ['sante.gouv.fr']),
  organization('directionC2', ['central', 'government', 'ministryC'], ['sante.gouv.fr']),
  organization('ministryOfInterior', ['central', 'government'], ['interieur.gouv.fr']),
  organization('courtX', [], ['ministry-a.gouv.fr']),
  organization('courtY', [], ['ministry-a.gouv.fr']),
  organization('brigade1', [], ['network.interieur.gouv.fr']),
  organization('brigade2', [], ['network.interieur.gouv.fr']),
  organization('brigade3', [], ['network.interieur.gouv.fr']),
  organization('townHall', [], ['ville.fr']),
  organization('socialCenter', [], ['ville.fr']),
  organization('otherTownHall', [], ['autre-ville.fr'], false, townHallPriority),
  organization('otherSocialCenter', [], ['autre-ville.fr']),
  organization('otherMunicipalPolice', [], ['autre-ville.fr']),
  organization('intermunicipality', [], ['agglo.fr'], false, intermunicipalityPriority),
  organization('portalServiceA', ['central', 'government'], ['portal.gouv.fr']),
  organization('portalServiceB', ['central', 'government'], ['portal.gouv.fr']),
  organization('portalServiceC', ['central', 'government'], ['portal.gouv.fr']),
  organization('portalServiceD', ['central', 'government'], ['portal.gouv.fr']),
  organization('aTownHallOfTheIntermunicipality', [], ['agglo.fr'], false, townHallPriority),
];

const matcher = new OrganizationMatcher(organizations, [
  { url: 'https://github.com/betagouv', organizationId: 'teamA' },
  { url: 'https://gitlab.com/group/subgroup', organizationId: 'ministryB' },
  { url: 'https://forge.ministry-c.fr', organizationId: 'ministryC' },
  { url: 'https://github.com/unknown-organization', organizationId: 'not-in-the-directory' },
]);

describe('normalizeHostname()', () => {
  it('should ignore case, trailing dot and "www."', () => {
    expect(normalizeHostname('WWW.Example.COM.')).toBe('example.com');
    expect(normalizeHostname('sub.example.com')).toBe('sub.example.com');
  });
});

describe('getRegistrableDomain()', () => {
  it('should take into account public suffixes', () => {
    expect(getRegistrableDomain('ecobalyse.beta.gouv.fr')).toBe('beta.gouv.fr');
    expect(getRegistrableDomain('foo.github.io')).toBe('foo.github.io');
    expect(getRegistrableDomain('localhost')).toBeNull();
  });
});

describe('extractOrganizationDomain()', () => {
  it('should keep websites pointing to a whole website', () => {
    expect(extractOrganizationDomain('https://www.numerique.gouv.fr')).toBe('numerique.gouv.fr');
    expect(extractOrganizationDomain('https://www.diplomatie.gouv.fr/fr/')).toBe('diplomatie.gouv.fr');
    expect(extractOrganizationDomain('www.mairie.fr')).toBe('mairie.fr');
  });

  it('should skip presentation pages hosted on a bigger website', () => {
    expect(extractOrganizationDomain('https://www.numerique.gouv.fr/dinum/organigramme')).toBeNull();
    expect(extractOrganizationDomain('not a url')).toBeNull();
    expect(extractOrganizationDomain('')).toBeNull();
  });
});

describe('normalizeRepositoryUrl()', () => {
  it('should be comparable whatever the writing', () => {
    expect(normalizeRepositoryUrl(' https://GitHub.com/BetaGouv/ ')).toBe('https://github.com/betagouv');
    expect(normalizeRepositoryUrl('https://github.com/betagouv/repo.git')).toBe('https://github.com/betagouv/repo');
    expect(normalizeRepositoryUrl('https://github.com/betagouv/repo.git/')).toBe('https://github.com/betagouv/repo');
  });
});

describe('OrganizationMatcher', () => {
  describe('matchWebsite()', () => {
    it('should keep the top-most organization of a branch and ignore standalone ones mentioning the same website', () => {
      expect(matcher.matchWebsite('https://www.ministry-a.gouv.fr')).toStrictEqual(['ministryA']);
    });

    it('should bind the specific domain of a sub-organization', () => {
      expect(matcher.matchWebsite('https://direction-a.gouv.fr/some/page')).toStrictEqual(['directionA']);
    });

    it('should fallback on parent domains when the exact one is unknown', () => {
      expect(matcher.matchWebsite('https://ecobalyse.beta.gouv.fr')).toStrictEqual(['teamA']);
    });

    it('should never go beyond the registrable domain', () => {
      expect(matcher.matchWebsite('https://unknown.gouv.fr')).toStrictEqual([]);
    });

    it('should use the common ancestor when it is meaningful', () => {
      expect(matcher.matchWebsite('https://sante.gouv.fr')).toStrictEqual(['ministryC']);
    });

    it('should keep all organizations at the same level when their common ancestor is too generic', () => {
      expect(matcher.matchWebsite('https://shared-ministries.gouv.fr').sort()).toStrictEqual(['ministryB', 'ministryC']);
    });

    it('should consider a domain shared by many organizations of different branches as generic', () => {
      expect(matcher.matchWebsite('https://portal.gouv.fr')).toStrictEqual([]);
    });

    it('should tolerate a few standalone organizations sharing a domain', () => {
      expect(matcher.matchWebsite('https://ville.fr').sort()).toStrictEqual(['socialCenter', 'townHall']);
    });

    it('should give a website shared by local services to the local authority owning it', () => {
      expect(matcher.matchWebsite('https://autre-ville.fr')).toStrictEqual(['otherTownHall']);
      expect(matcher.matchWebsite('https://agglo.fr')).toStrictEqual(['intermunicipality']);
    });

    it('should consider a domain shared by many standalone organizations as generic, and try the parent domain', () => {
      expect(matcher.matchWebsite('https://network.interieur.gouv.fr')).toStrictEqual(['ministryOfInterior']);
    });

    it('should ignore invalid URLs', () => {
      expect(matcher.matchWebsite('not a url')).toStrictEqual([]);
    });
  });

  describe('resolveDomainOrganizations() with a dominant branch', () => {
    const branch = { hasChildren: false, domains: ['impots.gouv.fr'], websiteOwnerPriority: null };
    const organizations = [
      { id: 'root', ancestorIds: [], level: 1, hasChildren: true, domains: [], websiteOwnerPriority: null },
      { id: 'ministry', ancestorIds: ['root'], level: 3, hasChildren: true, domains: [], websiteOwnerPriority: null },
      { id: 'dgfip', ancestorIds: ['root', 'ministry'], level: 4, hasChildren: true, domains: [], websiteOwnerPriority: null },
      ...['a', 'b', 'c', 'd'].map((id) => ({ ...branch, id: id, ancestorIds: ['root', 'ministry', 'dgfip'], level: 5 })),
      { ...branch, id: 'overseas', ancestorIds: ['root'], level: 2 },
    ];

    it('should bind the branch gathering almost all organizations declaring the domain', () => {
      expect(new OrganizationMatcher(organizations, []).matchWebsite('https://www.impots.gouv.fr')).toStrictEqual(['dgfip']);
    });
  });

  describe('matchRepository()', () => {
    it('should match the repository account', () => {
      expect(matcher.matchRepository('https://github.com/betagouv/etabli')).toStrictEqual(['teamA']);
      expect(matcher.matchRepository('https://github.com/BetaGouv/etabli.git')).toStrictEqual(['teamA']);
    });

    it('should match the deepest listed group', () => {
      expect(matcher.matchRepository('https://gitlab.com/group/subgroup/deeper/repository')).toStrictEqual(['ministryB']);
    });

    it('should match forges dedicated to an organization', () => {
      expect(matcher.matchRepository('https://forge.ministry-c.fr/team/repository')).toStrictEqual(['ministryC']);
    });

    it('should not match unknown accounts or organizations missing from the directory', () => {
      expect(matcher.matchRepository('https://github.com/someone/repository')).toStrictEqual([]);
      expect(matcher.matchRepository('https://github.com/unknown-organization/repository')).toStrictEqual([]);
    });

    it('should not consider the repository name as an account', () => {
      expect(matcher.matchRepository('https://github.com/betagouv')).toStrictEqual([]);
    });
  });

  describe('areCloseOrganizations()', () => {
    const toOrganization = (id: string, ancestorIds: string[]) => ({
      id: id,
      ancestorIds: ancestorIds,
      level: ancestorIds.length + 1,
      hasChildren: false,
      domains: [],
      websiteOwnerPriority: null,
    });
    const matcher = new OrganizationMatcher(
      [
        toOrganization('root', []),
        toOrganization('government', ['root']),
        toOrganization('ministry', ['root', 'government']),
        toOrganization('direction', ['root', 'government', 'ministry']),
        toOrganization('agency', ['root', 'government', 'ministry']),
        toOrganization('team', ['root', 'government', 'ministry', 'direction']),
        toOrganization('otherTeam', ['root', 'government', 'ministry', 'direction']),
      ],
      []
    );

    it('should accept a same organization or a same direction', () => {
      expect(matcher.areCloseOrganizations(['agency'], ['agency'])).toBe(true);
      expect(matcher.areCloseOrganizations(['team'], ['otherTeam'])).toBe(true);
    });

    it('should not conclude from a same ministry', () => {
      expect(matcher.areCloseOrganizations(['agency'], ['direction'])).toBe(false);
      expect(matcher.areCloseOrganizations(['agency'], ['ministry'])).toBe(false);
    });
  });

  describe('matchInitiative() with repositories of several accounts', () => {
    const organizations = ['main', 'guest'].map((id) => ({
      id: id,
      ancestorIds: [],
      level: 1,
      hasChildren: false,
      domains: [],
      websiteOwnerPriority: null,
    }));
    const matcher = new OrganizationMatcher(organizations, [
      { url: 'https://github.com/main', organizationId: 'main' },
      { url: 'https://github.com/guest', organizationId: 'guest' },
    ]);
    const mainRepositories = ['a', 'b', 'c', 'd'].map((name) => `https://github.com/main/${name}`);

    it('should ignore an account owning a small part of them', () => {
      expect(matcher.matchInitiative({ websites: [], repositories: [...mainRepositories, 'https://github.com/guest/x'] })).toStrictEqual(['main']);
    });

    it('should keep accounts sharing them', () => {
      expect(matcher.matchInitiative({ websites: [], repositories: ['https://github.com/main/a', 'https://github.com/guest/x'] })).toStrictEqual([
        'guest',
        'main',
      ]);
    });
  });

  describe('matchInitiative()', () => {
    it('should keep the most precise organization of a same branch', () => {
      expect(
        matcher.matchInitiative({
          websites: ['https://ministry-a.gouv.fr'],
          repositories: ['https://github.com/betagouv/project'],
        })
      ).toStrictEqual(['teamA']);
    });

    it('should keep organizations of different branches (cross-organization initiative)', () => {
      expect(
        matcher.matchInitiative({
          websites: ['https://project.beta.gouv.fr'],
          repositories: ['https://forge.ministry-c.fr/team/project'],
        })
      ).toStrictEqual(['ministryC', 'teamA']);
    });

    it('should return nothing for unknown initiatives', () => {
      expect(matcher.matchInitiative({ websites: ['https://example.com'], repositories: [] })).toStrictEqual([]);
    });
  });
});

describe('getWebsiteOwnerPriority()', () => {
  it('should rank local authorities by scope', () => {
    const region = getWebsiteOwnerPriority({ name: 'Région', localServiceType: 'cr' }) as number;
    const townHall = getWebsiteOwnerPriority({ name: 'Mairie - Ville', localServiceType: 'mairie' }) as number;
    const delegatedTownHall = getWebsiteOwnerPriority({ name: 'Mairie déléguée - Ancienne ville', localServiceType: 'mairie' }) as number;

    expect(region).toBeLessThan(townHall);
    expect(townHall).toBeLessThan(delegatedTownHall);
    expect(getWebsiteOwnerPriority({ name: 'CCAS', localServiceType: 'ccas' })).toBeNull();
    expect(getWebsiteOwnerPriority({ name: 'Ministère', localServiceType: null })).toBeNull();
  });
});

describe('assertUsableOrganizationsDirectory()', () => {
  it('should tolerate a few malformed records', () => {
    expect(() => assertUsableOrganizationsDirectory(100, 0)).not.toThrow();
    expect(() => assertUsableOrganizationsDirectory(100, 5)).not.toThrow();
  });

  it('should refuse an empty or mostly malformed directory', () => {
    expect(() => assertUsableOrganizationsDirectory(0, 0)).toThrow();
    expect(() => assertUsableOrganizationsDirectory(100, 6)).toThrow();
    expect(() => assertUsableOrganizationsDirectory(100, 100)).toThrow();
  });
});

describe('assertSafeOrganizationsRemoval()', () => {
  it('should allow the first synchronization and usual changes', () => {
    expect(() => assertSafeOrganizationsRemoval(0, 0)).not.toThrow();
    expect(() => assertSafeOrganizationsRemoval(1000, 100)).not.toThrow();
  });

  it('should refuse removing too many organizations', () => {
    expect(() => assertSafeOrganizationsRemoval(1000, 101)).toThrow();
    expect(() => assertSafeOrganizationsRemoval(1000, 1000)).toThrow();
  });
});
