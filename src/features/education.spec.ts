/**
 * @jest-environment node
 */
import { addEducationWebsitesToRectorates } from '@etabli/src/features/education';
import { LiteOrganizationSchemaType } from '@etabli/src/models/entities/organization';

function toOrganizations(items: { name: string; domains?: string[] }[]) {
  return new Map(
    items.map(({ name, domains }) => [
      name,
      {
        dilaId: name,
        parentDilaId: null,
        ancestorDilaIds: [],
        level: 1,
        name: name,
        acronym: null,
        domains: domains ?? [],
        directoryUrl: null,
        localServiceType: null,
        isTerritorial: false,
      } as LiteOrganizationSchemaType,
    ])
  );
}

const education = "MINISTERE DE L'EDUCATION NATIONALE";

describe('addEducationWebsitesToRectorates()', () => {
  it('should give the website to the supervising ministry when it is not the one of education', () => {
    const agricultureDilaId = '45e488a2-c977-487f-b62f-19b4d6504d9c';
    const organizations = toOrganizations([{ name: 'Rectorat - Académie de Lyon' }, { name: agricultureDilaId }, { name: 'Autre' }]);

    addEducationWebsitesToRectorates(organizations, [
      { web: 'https://lycee-agricole.fr', libelle_academie: 'Lyon', ministere_tutelle: 'AGRICULTURE' },
      { web: 'https://lycee-maritime.fr', libelle_academie: 'Lyon', ministere_tutelle: 'MER' },
    ]);

    expect(organizations.get(agricultureDilaId)?.domains).toStrictEqual(['lycee-agricole.fr']);
    expect(organizations.get('Rectorat - Académie de Lyon')?.domains).toStrictEqual([]);
  });

  it('should give the website of a school to the rectorate of its academy', () => {
    const organizations = toOrganizations([
      { name: 'Rectorat - Académie de Strasbourg', domains: ['ac-strasbourg.fr'] },
      { name: "Rectorat - Académie d'Orléans-Tours" },
      { name: 'Vice-rectorat - Nouvelle-Calédonie' },
    ]);

    addEducationWebsitesToRectorates(organizations, [
      { web: 'http://www.remyfaesch.fr', libelle_academie: 'Strasbourg', ministere_tutelle: education },
      { web: 'https://college-a.fr', libelle_academie: 'Orléans-Tours', ministere_tutelle: education },
      { web: 'college-b.nc', libelle_academie: 'Nouvelle Calédonie', ministere_tutelle: education },
    ]);

    expect(organizations.get('Rectorat - Académie de Strasbourg')?.domains).toStrictEqual(['ac-strasbourg.fr', 'remyfaesch.fr']);
    expect(organizations.get("Rectorat - Académie d'Orléans-Tours")?.domains).toStrictEqual(['college-a.fr']);
    expect(organizations.get('Vice-rectorat - Nouvelle-Calédonie')?.domains).toStrictEqual(['college-b.nc']);
  });

  it('should not take a website that seems not specific to a school', () => {
    const organizations = toOrganizations([
      { name: 'Rectorat - Académie de Lyon' },
      { name: 'Rectorat - Académie de Nice' },
      { name: 'Mairie - Vaulx', domains: ['ville-vaulx.fr'] },
    ]);
    const sharedByManySchools = Array.from({ length: 3 }, () => ({
      web: 'https://portail-ent.fr',
      libelle_academie: 'Lyon',
      ministere_tutelle: education,
    }));

    addEducationWebsitesToRectorates(organizations, [
      { web: 'https://ville-vaulx.fr', libelle_academie: 'Lyon', ministere_tutelle: education }, // Already declared
      { web: 'https://reseau.fr', libelle_academie: 'Lyon', ministere_tutelle: education }, // Across academies
      { web: 'https://reseau.fr', libelle_academie: 'Nice', ministere_tutelle: education },
      { web: 'https://ville-vaulx.fr/ecole', libelle_academie: 'Lyon', ministere_tutelle: education }, // Not a home page
      ...sharedByManySchools,
    ]);

    expect(organizations.get('Rectorat - Académie de Lyon')?.domains).toStrictEqual([]);
    expect(organizations.get('Rectorat - Académie de Nice')?.domains).toStrictEqual([]);
  });
});
