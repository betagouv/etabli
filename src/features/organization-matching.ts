import { ParseResultType, parseDomain } from 'parse-domain';

// This module only contains the pure logic to bind initiatives to organizations of the DILA directory,
// so it can be unit tested without a database (see `organization.ts` for the data synchronization)

export interface MatchableOrganization {
  id: string;
  ancestorIds: string[]; // From the root to the direct parent
  level: number; // 1 for a root organization
  hasChildren: boolean;
  domains: string[]; // Already normalized (see `normalizeHostname()`)
  websiteOwnerPriority: number | null; // See `getWebsiteOwnerPriority()`
}

export interface MatchableRepositoryOrganization {
  url: string; // Already normalized (see `normalizeRepositoryOrganizationUrl()`)
  organizationId: string;
}

// When several organizations that are not part of the hierarchy share the same domain (e.g. thousands of local
// gendarmerie brigades declaring `gendarmerie.interieur.gouv.fr`), the domain is not specific to any of them.
// We tolerate a few (a town hall and its social center often share the town website) but not more.
export const MAXIMUM_STANDALONE_ORGANIZATIONS_SHARING_A_DOMAIN = 2;

// When several organizations at the same level of the hierarchy share a domain, we bind their common ancestor
// instead, but only if it is still meaningful (level 3 is ministries, regions, institutions... while upper levels
// are generic categories like "Gouvernement (Premier ministre et ministères)")
export const MINIMUM_MEANINGFUL_COMMON_ANCESTOR_LEVEL = 3;

// Beyond this number, organizations of the hierarchy sharing a domain without meaningful common ancestor (e.g. a portal
// declared by services of many ministries) means the domain is not specific to them
export const MAXIMUM_HIERARCHICAL_ORGANIZATIONS_SHARING_A_DOMAIN = 3;

// A network of local offices often declares the website of its administration without the administration doing so itself
// (e.g. `impots.gouv.fr` is declared by offices of the DGFiP, but not by the DGFiP), so when almost all organizations of the
// hierarchy sharing a domain are under one branch the domain is considered as belonging to this branch
export const MINIMUM_ORGANIZATIONS_FOR_DOMINANT_BRANCH = 4;
export const MINIMUM_DOMINANT_BRANCH_SHARE = 0.8;

// An account owning a small part of the repositories of an initiative is a contribution, not an ownership
// (e.g. a demo from another organization published on `code.gouv.fr`)
export const MINIMUM_REPOSITORIES_SHARE_FOR_BINDING = 0.25;

// Level of the branch 2 organizations must share to be considered as close (level 3 is ministries)
export const MINIMUM_CLOSE_ORGANIZATIONS_LEVEL = 4;

// Domains that no organization of the directory declares whereas they obviously belong to one of them (key being its `dilaId`)
export const additionalOrganizationDomains: Record<string, string[]> = {
  'c4195774-f535-4d82-b03f-d5f0c6b08635': ['finances.gouv.fr'], // Ministry of economy
  '05f90b6a-e3d9-4a41-a919-2e2f2d77e517': ['developpement-durable.gouv.fr'], // Ministry of ecological transition
  'f130ad96-4a81-4eb4-a40c-0539edad5fff': ['social.gouv.fr', 'travail.gouv.fr', 'emploi.gouv.fr'], // Ministry of labor and solidarity
  '051be6c4-2693-45e0-9644-b84049e57f02': ['logement.gouv.fr'], // Ministry of housing
  '0aed72f5-21ba-42da-9f16-01a529b3df14': ['aviation-civile.gouv.fr'], // DGAC
  'fa33b07a-3f71-46d4-b682-569c9faf211e': ['pref.gouv.fr'], // Ministry of the interior
  'd1a97841-b4bf-46df-a089-1003e4e266b4': ['api.gouv.fr', 'code.gouv.fr'], // DINUM
};

// Local services often share the website of the local authority they depend on (e.g. a social center (CCAS), a municipal
// police or a delegated town hall using the town website). When standalone organizations share a website, the local
// authority with the widest scope owns it. Others (services) get no priority.
const websiteOwnerLocalServiceTypes = ['cr', 'cg', 'epci', 'mairie']; // Region, department, intermunicipality, town hall

export function getWebsiteOwnerPriority(organization: { name: string; localServiceType: string | null }): number | null {
  if (!organization.localServiceType) {
    return null;
  }

  const index = websiteOwnerLocalServiceTypes.indexOf(organization.localServiceType);
  if (index === -1) {
    return null;
  }

  // A delegated town hall (former town merged into a new one) uses the website of the new town
  if (organization.localServiceType === 'mairie' && /^mairie déléguée/i.test(organization.name)) {
    return websiteOwnerLocalServiceTypes.length;
  }

  return index;
}

// A website and a repository named the same way within a same organization are the same initiative, except for these usual names
const genericRepositoryNames = new Set([
  'admin',
  'backend',
  'documentation',
  'formation',
  'frontend',
  'mediatheque',
  'portail',
  'preprod',
  'recette',
  'staging',
  'static',
  'template',
  'website',
]);

export function getComparableWebsiteName(hostname: string): string | null {
  const label = normalizeHostname(hostname).split('.')[0];

  return label.length >= 6 && !genericRepositoryNames.has(label) ? label : null;
}

export function normalizeRepositoryUrl(url: string): string {
  return url
    .trim()
    .toLowerCase()
    .replace(/\/+$/, '')
    .replace(/\.git$/, '');
}

export function normalizeHostname(hostname: string): string {
  const lowercased = hostname.trim().toLowerCase().replace(/\.+$/, '');

  // `www.example.com` and `example.com` are considered the same website, it always depends on who has written the URL
  return lowercased.startsWith('www.') ? lowercased.substring(4) : lowercased;
}

// Returns the domain someone can register (e.g. `beta.gouv.fr` for `ecobalyse.beta.gouv.fr` since `gouv.fr` is a public suffix)
export function getRegistrableDomain(hostname: string): string | null {
  const parsedDomain = parseDomain(hostname);

  if (parsedDomain.type !== ParseResultType.Listed || !parsedDomain.domain) {
    return null;
  }

  return [parsedDomain.domain, ...parsedDomain.topLevelDomains].join('.');
}

// A website path that is only about the language or the home page still represents the whole website
const homePagePathPattern = /^\/((fr|en|fr-fr|fr_fr|accueil|home|index[\w.-]*)\/?)?$/i;

// The directory lists websites as free text, so we only keep those pointing to a whole website (not a presentation
// page of the organization on a bigger website, otherwise a sub-organization would be bound to all initiatives of the main website)
export function extractOrganizationDomain(rawWebsite: string): string | null {
  let value = rawWebsite.trim();
  if (value === '') {
    return null;
  }

  // A few links are missing the protocol
  if (!/^https?:\/\//i.test(value)) {
    value = `https://${value}`;
  }

  let url: URL;
  try {
    url = new URL(value);
  } catch (error) {
    return null;
  }

  if (!url.hostname.includes('.') || !homePagePathPattern.test(url.pathname)) {
    return null;
  }

  return normalizeHostname(url.hostname);
}

export function normalizeRepositoryOrganizationUrl(rawUrl: string): string {
  return rawUrl
    .trim()
    .toLowerCase()
    .replace(/\.git$/, '')
    .replace(/\/+$/, '');
}

export class OrganizationMatcher {
  protected readonly organizations = new Map<string, MatchableOrganization>();
  protected readonly organizationsByDomain = new Map<string, string[]>();
  protected readonly organizationIdByRepositoryOrganizationUrl = new Map<string, string>();

  public constructor(organizations: MatchableOrganization[], repositoryOrganizations: MatchableRepositoryOrganization[]) {
    for (const organization of organizations) {
      this.organizations.set(organization.id, organization);

      for (const domain of new Set(organization.domains)) {
        const organizationsIds = this.organizationsByDomain.get(domain);

        if (organizationsIds) {
          organizationsIds.push(organization.id);
        } else {
          this.organizationsByDomain.set(domain, [organization.id]);
        }
      }
    }

    for (const repositoryOrganization of repositoryOrganizations) {
      if (this.organizations.has(repositoryOrganization.organizationId)) {
        this.organizationIdByRepositoryOrganizationUrl.set(
          normalizeRepositoryOrganizationUrl(repositoryOrganization.url),
          repositoryOrganization.organizationId
        );
      }
    }
  }

  protected getOrganization(organizationId: string): MatchableOrganization {
    const organization = this.organizations.get(organizationId);
    if (!organization) {
      throw new Error(`the organization "${organizationId}" should be registered in the matcher`);
    }

    return organization;
  }

  protected isPartOfHierarchy(organization: MatchableOrganization): boolean {
    return organization.ancestorIds.length > 0 || organization.hasChildren;
  }

  // For organizations of the same tree branch, keep only the top-most one
  // (many sub-organizations declare by default the website of their parent organization)
  public keepTopMostOrganizations(organizationsIds: string[]): string[] {
    const uniqueIds = new Set(organizationsIds);

    return [...uniqueIds].filter((organizationId) => {
      return !this.getOrganization(organizationId).ancestorIds.some((ancestorId) => uniqueIds.has(ancestorId));
    });
  }

  // For organizations of the same tree branch, keep only the deepest one (to be as precise as possible)
  public keepMostPreciseOrganizations(organizationsIds: string[]): string[] {
    const uniqueIds = new Set(organizationsIds);
    const ancestorsOfOthers = new Set<string>();

    for (const organizationId of uniqueIds) {
      for (const ancestorId of this.getOrganization(organizationId).ancestorIds) {
        ancestorsOfOthers.add(ancestorId);
      }
    }

    return [...uniqueIds].filter((organizationId) => !ancestorsOfOthers.has(organizationId));
  }

  protected getLowestCommonAncestor(organizationsIds: string[]): string | null {
    const paths = organizationsIds.map((organizationId) => {
      const organization = this.getOrganization(organizationId);

      return [...organization.ancestorIds, organization.id];
    });

    const shortestPathLength = Math.min(...paths.map((organizationPath) => organizationPath.length));

    let commonAncestorId: string | null = null;
    for (let index = 0; index < shortestPathLength; index++) {
      const candidateId = paths[0][index];

      if (paths.every((organizationPath) => organizationPath[index] === candidateId)) {
        commonAncestorId = candidateId;
      } else {
        break;
      }
    }

    return commonAncestorId;
  }

  protected getDominantBranch(organizationsIds: string[]): string | null {
    if (organizationsIds.length < MINIMUM_ORGANIZATIONS_FOR_DOMINANT_BRANCH) {
      return null;
    }

    const countsByBranch = new Map<string, number>();
    for (const organizationId of organizationsIds) {
      for (const branchId of [...this.getOrganization(organizationId).ancestorIds, organizationId]) {
        countsByBranch.set(branchId, (countsByBranch.get(branchId) ?? 0) + 1);
      }
    }

    let dominantBranch: MatchableOrganization | null = null;
    for (const [branchId, count] of countsByBranch) {
      const branch = this.getOrganization(branchId);

      if (
        count / organizationsIds.length >= MINIMUM_DOMINANT_BRANCH_SHARE &&
        branch.level >= MINIMUM_MEANINGFUL_COMMON_ANCESTOR_LEVEL &&
        (!dominantBranch || branch.level > dominantBranch.level)
      ) {
        dominantBranch = branch;
      }
    }

    return dominantBranch?.id ?? null;
  }

  // Decide which organizations a domain really belongs to, `null` meaning the domain is too generic to conclude
  public resolveDomainOrganizations(domain: string): string[] | null {
    const candidatesIds = this.organizationsByDomain.get(domain);
    if (!candidatesIds) {
      return null;
    }

    const topMostIds = this.keepTopMostOrganizations(candidatesIds);

    // Organizations part of the hierarchy are more reliable than standalone ones that just mention a network website
    // (e.g. `justice.gouv.fr` is declared by the ministry but also by hundreds of standalone courts)
    const hierarchicalIds = topMostIds.filter((organizationId) => this.isPartOfHierarchy(this.getOrganization(organizationId)));

    if (hierarchicalIds.length > 0) {
      const dominantBranchId = this.getDominantBranch(hierarchicalIds);
      if (dominantBranchId) {
        return [dominantBranchId];
      }

      const topLevel = Math.min(...hierarchicalIds.map((organizationId) => this.getOrganization(organizationId).level));
      const topLevelIds = hierarchicalIds.filter((organizationId) => this.getOrganization(organizationId).level === topLevel);

      if (topLevelIds.length > 1) {
        const commonAncestorId = this.getLowestCommonAncestor(topLevelIds);

        if (commonAncestorId && this.getOrganization(commonAncestorId).level >= MINIMUM_MEANINGFUL_COMMON_ANCESTOR_LEVEL) {
          return [commonAncestorId];
        }
      }

      if (topLevelIds.length > MAXIMUM_HIERARCHICAL_ORGANIZATIONS_SHARING_A_DOMAIN) {
        return null;
      }

      return topLevelIds;
    }

    // A shared website belongs to the local authority with the widest scope, if any
    const ownersIds = topMostIds.filter((organizationId) => this.getOrganization(organizationId).websiteOwnerPriority !== null);
    if (ownersIds.length > 0) {
      const bestPriority = Math.min(...ownersIds.map((organizationId) => this.getOrganization(organizationId).websiteOwnerPriority as number));
      const bestOwnersIds = ownersIds.filter((organizationId) => this.getOrganization(organizationId).websiteOwnerPriority === bestPriority);

      // Several owners of the same kind (e.g. multiple town halls) means the website is not specific to one of them
      if (bestOwnersIds.length <= MAXIMUM_STANDALONE_ORGANIZATIONS_SHARING_A_DOMAIN) {
        return bestOwnersIds;
      }
    } else if (topMostIds.length <= MAXIMUM_STANDALONE_ORGANIZATIONS_SHARING_A_DOMAIN) {
      return topMostIds;
    }

    return null;
  }

  public matchWebsite(websiteUrl: string): string[] {
    let hostname: string;
    try {
      hostname = normalizeHostname(new URL(websiteUrl).hostname);
    } catch (error) {
      return [];
    }

    const registrableDomain = getRegistrableDomain(hostname);

    // If the exact domain is not listed (or too generic), we try parent domains up to the registrable one
    // (e.g. `ecobalyse.beta.gouv.fr` -> `beta.gouv.fr`, but never `gouv.fr` which is a public suffix)
    let currentDomain = hostname;
    while (true) {
      const organizationsIds = this.resolveDomainOrganizations(currentDomain);
      if (organizationsIds) {
        return organizationsIds;
      }

      if (!registrableDomain || currentDomain === registrableDomain || !currentDomain.includes('.')) {
        return [];
      }

      currentDomain = currentDomain.substring(currentDomain.indexOf('.') + 1);
    }
  }

  public matchRepository(repositoryUrl: string): string[] {
    let url: URL;
    try {
      url = new URL(normalizeRepositoryOrganizationUrl(repositoryUrl));
    } catch (error) {
      return [];
    }

    const forgeUrl = `${url.protocol}//${url.host}`;
    const pathSegments = url.pathname.split('/').filter((segment) => segment !== '');

    // Look for the deepest listed account (GitLab can have nested subgroups), the last segment being the repository itself
    for (let length = pathSegments.length - 1; length >= 1; length--) {
      const organizationId = this.organizationIdByRepositoryOrganizationUrl.get(`${forgeUrl}/${pathSegments.slice(0, length).join('/')}`);

      if (organizationId) {
        return [organizationId];
      }
    }

    // Some forges are entirely dedicated to one organization
    const forgeOrganizationId = this.organizationIdByRepositoryOrganizationUrl.get(forgeUrl);

    return forgeOrganizationId ? [forgeOrganizationId] : [];
  }

  // Tell if both sets contain the same organization, or organizations close enough (a ministry is too wide to conclude)
  public areCloseOrganizations(organizationsIds: string[], otherOrganizationsIds: string[]): boolean {
    return organizationsIds.some((id) =>
      otherOrganizationsIds.some((otherId) => {
        const commonAncestorId = id === otherId ? id : this.getLowestCommonAncestor([id, otherId]);

        return id === otherId || (!!commonAncestorId && this.getOrganization(commonAncestorId).level >= MINIMUM_CLOSE_ORGANIZATIONS_LEVEL);
      })
    );
  }

  public matchInitiative(initiative: { websites: string[]; repositories: string[] }): string[] {
    const organizationsIds: string[] = [];

    for (const website of initiative.websites) {
      organizationsIds.push(...this.matchWebsite(website));
    }

    const repositoriesCountByOrganization = new Map<string, number>();
    let matchedRepositoriesCount = 0;
    for (const repository of initiative.repositories) {
      const repositoryOrganizationsIds = this.matchRepository(repository);

      if (repositoryOrganizationsIds.length > 0) {
        matchedRepositoriesCount++;
      }

      for (const organizationId of repositoryOrganizationsIds) {
        repositoriesCountByOrganization.set(organizationId, (repositoriesCountByOrganization.get(organizationId) ?? 0) + 1);
      }
    }

    for (const [organizationId, repositoriesCount] of repositoriesCountByOrganization) {
      if (repositoriesCount / matchedRepositoriesCount >= MINIMUM_REPOSITORIES_SHARE_FOR_BINDING) {
        organizationsIds.push(organizationId);
      }
    }

    // An initiative can belong to several organizations (cross-organization projects) but for a same branch we keep the most precise one
    return this.keepMostPreciseOrganizations(organizationsIds).sort();
  }
}
