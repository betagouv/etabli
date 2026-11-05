import { normalizeHostname } from '@etabli/src/features/organization-matching';
import { LiteOrganizationSchemaType } from '@etabli/src/models/entities/organization';

// Town halls and most local services have no parent in the DILA directory since no authority sits above them (local authorities
// administer themselves freely), so being placed under their department only tells where they are, this is why they are flagged as
// "territorial": it helps browsing and filtering them, but it must not be used to deduce any ownership
export function getDepartmentCode(inseeCode: string): string {
  return inseeCode.startsWith('97') || inseeCode.startsWith('98') ? inseeCode.slice(0, 3) : inseeCode.slice(0, 2);
}

// Mutates organizations to place standalone ones under the node of their department (e.g. "Finistère - 29")
export function attachStandaloneOrganizationsToTerritories(
  organizations: Map<LiteOrganizationSchemaType['dilaId'], LiteOrganizationSchemaType>,
  inseeCodeByDilaId: Map<LiteOrganizationSchemaType['dilaId'], string>
): void {
  const departmentByCode = new Map<string, LiteOrganizationSchemaType>();
  const parentsDilaIds = new Set<string>();
  for (const organization of organizations.values()) {
    if (organization.parentDilaId) {
      parentsDilaIds.add(organization.parentDilaId);
    }

    const code = organization.name.match(/^.+ - (\d{2,3}|2[AB])$/)?.[1];
    if (code && organization.parentDilaId && !organization.localServiceType) {
      departmentByCode.set(code, organization);
    }
  }

  for (const organization of organizations.values()) {
    const inseeCode = inseeCodeByDilaId.get(organization.dilaId);
    const department = inseeCode ? departmentByCode.get(getDepartmentCode(inseeCode)) : undefined;

    if (department && !organization.parentDilaId && !parentsDilaIds.has(organization.dilaId)) {
      organization.parentDilaId = department.dilaId;
      organization.ancestorDilaIds = [...department.ancestorDilaIds, department.dilaId];
      organization.level = department.level + 1;
      organization.isTerritorial = true;
    }
  }
}

interface OfficialRecord {
  type: string;
  siren: string;
  libelle: string;
  site_internet: string | null;
  service_public_url: string | null;
  epci_siren: string | null;
}

function getDilaId(record: OfficialRecord): string | null {
  return record.service_public_url?.match(/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/)?.[1] ?? null;
}

// Mutates organizations to place communes under their intercommunality. It is a membership and not an authority either, so they
// stay territorial. It needs the department to be already known since an intercommunality is placed under it
export function attachCommunesToIntercommunalities(
  organizations: Map<LiteOrganizationSchemaType['dilaId'], LiteOrganizationSchemaType>,
  records: unknown[]
): void {
  const officialRecords = records as OfficialRecord[];
  const intercommunalityBySiren = new Map(officialRecords.filter((record) => record.type === 'epci').map((record) => [record.siren, record]));

  for (const record of officialRecords) {
    const commune = record.type === 'commune' ? organizations.get(getDilaId(record) ?? '') : undefined;
    const intercommunalityRecord = record.epci_siren ? intercommunalityBySiren.get(record.epci_siren) : undefined;
    const intercommunality = intercommunalityRecord ? organizations.get(getDilaId(intercommunalityRecord) ?? '') : undefined;

    if (commune?.isTerritorial && intercommunality?.isTerritorial) {
      commune.parentDilaId = intercommunality.dilaId;
      commune.ancestorDilaIds = [...intercommunality.ancestorDilaIds, intercommunality.dilaId];
      commune.level = intercommunality.level + 1;
    }
  }
}

export interface OfficialWebsite {
  hostname: string;
  siren: string;
  type: string;
}

// Websites of local authorities as declared to the administration
export function parseOfficialWebsites(records: unknown[]): OfficialWebsite[] {
  return (records as OfficialRecord[]).flatMap((record) => {
    try {
      return record.site_internet ? [{ hostname: new URL(record.site_internet).hostname.toLowerCase(), siren: record.siren, type: record.type }] : [];
    } catch (error) {
      return [];
    }
  });
}

export interface OfficialCollectivity {
  dilaId: string;
  name: string;
  website: string | null;
}

function normalizeName(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '');
}

// Extract the identifiers from the "Données de la Présence Numérique des Territoires" of the ANCT, which is the official list
// of local authorities (the link to their directory page gives the identifier used by the DILA)
export function parseOfficialCommunes(records: unknown[]): OfficialCollectivity[] {
  return (records as OfficialRecord[]).flatMap((record) => {
    const dilaId = getDilaId(record);

    return record.type === 'commune' && dilaId ? [{ dilaId: dilaId, name: record.libelle, website: record.site_internet }] : [];
  });
}

// Many town websites are declared nowhere, or by several organizations. It only concludes when there is no doubt
export class CommuneWebsiteMatcher {
  protected readonly communesByHostname = new Map<string, OfficialCollectivity[]>();
  protected readonly communesByName = new Map<string, OfficialCollectivity[]>();

  public constructor(communes: OfficialCollectivity[]) {
    for (const commune of communes) {
      const name = normalizeName(commune.name);
      this.communesByName.set(name, [...(this.communesByName.get(name) ?? []), commune]);

      if (commune.website) {
        try {
          const hostname = normalizeHostname(new URL(commune.website).hostname);

          this.communesByHostname.set(hostname, [...(this.communesByHostname.get(hostname) ?? []), commune]);
        } catch (error) {
          // A malformed website in the dataset is just ignored
        }
      }
    }
  }

  public match(websiteUrl: string, websiteTitle: string | null): OfficialCollectivity | null {
    let hostname: string;
    try {
      hostname = normalizeHostname(new URL(websiteUrl).hostname);
    } catch (error) {
      return null;
    }

    // The official website of exactly one commune
    const officialCommunes = this.communesByHostname.get(hostname);
    if (officialCommunes?.length === 1) {
      return officialCommunes[0];
    }

    // Otherwise the domain must be the name of a commune having no homonym, and the website must say the same
    const label = hostname
      .split('.')[0]
      .replace(/^(mairie|ville|commune)[-_]?/, '')
      .replace(/[-_]?\d+$/, '');
    const communes = this.communesByName.get(normalizeName(label));

    if (normalizeName(label).length < 4 || communes?.length !== 1 || !websiteTitle) {
      return null;
    }

    return normalizeName(websiteTitle).includes(normalizeName(communes[0].name)) ? communes[0] : null;
  }
}
