import z from 'zod';

import { extractOrganizationDomain } from '@etabli/src/features/organization-matching';
import { LiteOrganizationSchemaType } from '@etabli/src/models/entities/organization';

// The DILA directory does not list schools whereas thousands of them have a website, this directory from the national education
// does. They are not added as organizations (it would be thousands of them with one website), their website goes to their rectorate
export const EducationEstablishmentSchema = z.object({
  web: z.string(),
  libelle_academie: z.string(),
  ministere_tutelle: z.string(),
});
export type EducationEstablishmentSchemaType = z.infer<typeof EducationEstablishmentSchema>;

// Rectorates only stand for schools of the ministry of education, some others have their own (keys are as written in the directory, values
// are `dilaId`). The remaining ones (e.g. maritime schools) have no obvious entry in the DILA directory, they are skipped
const educationMinistryLabel = "MINISTERE DE L'EDUCATION NATIONALE";
const otherSupervisingMinistries: Record<string, string> = {
  AGRICULTURE: '45e488a2-c977-487f-b62f-19b4d6504d9c',
  DEFENSE: 'd24d1af2-c506-4b10-82e8-ab92b8e959d2',
};

// Above this a website is more likely a platform or a town portal than the website of a school
export const MAXIMUM_ESTABLISHMENTS_SHARING_A_WEBSITE = 2;

function normalizeName(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z]+/g, ' ')
    .trim();
}

function getRectorateAcademyName(organizationName: string): string | null {
  const match = organizationName.match(/^(?:Rectorat - Académie d(?:e |')|Vice-rectorat - )(.+)$/);

  return match ? normalizeName(match[1]) : null;
}

// Mutates the organizations to give the websites of schools to rectorates (or to the ministry supervising them)
export function addEducationWebsitesToRectorates(
  organizations: Map<LiteOrganizationSchemaType['dilaId'], LiteOrganizationSchemaType>,
  records: unknown[]
): void {
  const rectorateByAcademy = new Map<string, LiteOrganizationSchemaType>();
  const declaredDomains = new Set<string>();
  for (const organization of organizations.values()) {
    const academyName = getRectorateAcademyName(organization.name);
    if (academyName) {
      rectorateByAcademy.set(academyName, organization);
    }

    for (const domain of organization.domains) {
      declaredDomains.add(domain);
    }
  }

  const ownersByDomain = new Map<string, Set<LiteOrganizationSchemaType>>();
  const establishmentsCountByDomain = new Map<string, number>();
  for (const record of records) {
    const result = EducationEstablishmentSchema.safeParse(record);
    const domain = result.success ? extractOrganizationDomain(result.data.web) : null;

    if (result.success && domain) {
      const owner =
        result.data.ministere_tutelle === educationMinistryLabel
          ? rectorateByAcademy.get(normalizeName(result.data.libelle_academie))
          : organizations.get(otherSupervisingMinistries[result.data.ministere_tutelle]);

      establishmentsCountByDomain.set(domain, (establishmentsCountByDomain.get(domain) ?? 0) + 1);

      if (owner) {
        ownersByDomain.set(domain, (ownersByDomain.get(domain) ?? new Set()).add(owner));
      }
    }
  }

  let addedDomainsCount = 0;
  for (const [domain, owners] of ownersByDomain) {
    // A domain already known belongs to someone else (e.g. a school page hosted on the town website), the directory stays the reference
    if (
      declaredDomains.has(domain) ||
      owners.size > 1 ||
      (establishmentsCountByDomain.get(domain) as number) > MAXIMUM_ESTABLISHMENTS_SHARING_A_WEBSITE
    ) {
      continue;
    }

    const [owner] = owners;
    owner.domains = [...owner.domains, domain].sort();
    addedDomainsCount++;
  }

  console.log(`${addedDomainsCount} websites of schools have been given to their rectorate or supervising ministry`);
}
