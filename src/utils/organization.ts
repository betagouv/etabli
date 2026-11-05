import { InitiativeOrganizationSchemaType, OrganizationAncestorSchemaType } from '@etabli/src/models/entities/organization';

// In the DILA directory the first levels are generic categories ("Administration centrale" > "Gouvernement (Premier ministre et ministères)")
// so the third one is the first meaningful to summarize an organization (ministries, regions, independent authorities, institutions...)
export const SUMMARY_ORGANIZATION_LEVEL = 3;

export const organizationPathSeparator = ' › ';

type OrganizationWithPath = Pick<InitiativeOrganizationSchemaType, 'id' | 'name' | 'acronym' | 'ancestors'>;

export function getOrganizationPath(organization: OrganizationWithPath): OrganizationAncestorSchemaType[] {
  return [...organization.ancestors, { id: organization.id, name: organization.name, acronym: organization.acronym }];
}

export function formatOrganizationPath(organization: OrganizationWithPath): string {
  return getOrganizationPath(organization)
    .map((item) => item.name)
    .join(organizationPathSeparator);
}

// The organization summarizing the bound one (e.g. its ministry), except when the user focuses on a more precise
// organization of the same branch (e.g. when filtering on a direction we display the direction instead of the ministry)
export function getSummaryOrganization(organization: OrganizationWithPath, focusedOrganizationsIds: string[] = []): OrganizationAncestorSchemaType {
  const organizationPath = getOrganizationPath(organization);

  for (let index = organizationPath.length - 1; index >= SUMMARY_ORGANIZATION_LEVEL; index--) {
    if (focusedOrganizationsIds.includes(organizationPath[index].id)) {
      return organizationPath[index];
    }
  }

  return organizationPath[Math.min(SUMMARY_ORGANIZATION_LEVEL, organizationPath.length) - 1];
}

export interface OrganizationSummary {
  organization: OrganizationAncestorSchemaType;
  paths: OrganizationAncestorSchemaType[][]; // Full paths (from the root to the bound organization) summarized by this one
}

export function summarizeOrganizations(organizations: OrganizationWithPath[], focusedOrganizationsIds: string[] = []): OrganizationSummary[] {
  const summaries = new Map<string, OrganizationSummary>();

  for (const organization of organizations) {
    const summaryOrganization = getSummaryOrganization(organization, focusedOrganizationsIds);
    const summary = summaries.get(summaryOrganization.id);

    if (summary) {
      summary.paths.push(getOrganizationPath(organization));
    } else {
      summaries.set(summaryOrganization.id, {
        organization: summaryOrganization,
        paths: [getOrganizationPath(organization)],
      });
    }
  }

  return [...summaries.values()];
}

export interface OrganizationTreeNode {
  organization: OrganizationAncestorSchemaType;
  level: number;
  isBound: boolean; // The initiative is directly bound to it (otherwise it is only an ancestor)
  children: OrganizationTreeNode[];
}

// Merge paths sharing ancestors into a tree so they can be displayed as a hierarchy instead of repeated breadcrumbs
export function buildOrganizationTree(paths: OrganizationAncestorSchemaType[][]): OrganizationTreeNode[] {
  const roots: OrganizationTreeNode[] = [];

  for (const organizationPath of paths) {
    let siblings = roots;

    organizationPath.forEach((item, index) => {
      let node = siblings.find((sibling) => sibling.organization.id === item.id);

      if (!node) {
        node = { organization: item, level: index + 1, isBound: false, children: [] };
        siblings.push(node);
      }

      if (index === organizationPath.length - 1) {
        node.isBound = true;
      }

      siblings = node.children;
    });
  }

  return roots;
}

// Labels in small spaces (e.g. circles of the organizations map) would all start with the same generic words once truncated
const genericOrganizationPrefixPattern =
  /^(Ministère|Secrétariat d['’]État|Direction générale|Direction) (chargée? )?(de la |de l['’]|des |du |de |aux |à la |au )/i;

export function getShortOrganizationName(organization: { name: string; acronym: string | null }): string {
  if (organization.acronym && organization.acronym.length <= 12) {
    return organization.acronym;
  }

  const shortName = organization.name.replace(genericOrganizationPrefixPattern, '');

  return shortName.charAt(0).toUpperCase() + shortName.slice(1);
}

// Tells what has really been looked at for this initiative
export function getUnclassifiedExplanation(websitesCount: number, repositoriesCount: number): string {
  const sources: string[] = [];
  if (websitesCount > 0) {
    sources.push(websitesCount > 1 ? 'des sites internet' : 'du site internet');
  }
  if (repositoriesCount > 0) {
    sources.push(repositoriesCount > 1 ? 'des dépôts de code' : 'du dépôt de code');
  }

  return sources.length > 0
    ? `Aucune organisation publique n'a pu être reconnue à partir ${sources.join(' et ')} de cette initiative.`
    : "Aucune organisation publique n'a pu être reconnue pour cette initiative.";
}
