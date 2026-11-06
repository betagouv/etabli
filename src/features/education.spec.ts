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

describe('addEducationWebsitesToRectorates()', () => {
  it('should give the website of a school to the rectorate of its academy', () => {
    const organizations = toOrganizations([
      { name: 'Rectorat - Académie de Strasbourg', domains: ['ac-strasbourg.fr'] },
      { name: "Rectorat - Académie d'Orléans-Tours" },
      { name: 'Vice-rectorat - Nouvelle-Calédonie' },
    ]);

    addEducationWebsitesToRectorates(organizations, [
      { web: 'http://www.remyfaesch.fr', libelle_academie: 'Strasbourg' },
      { web: 'https://college-a.fr', libelle_academie: 'Orléans-Tours' },
      { web: 'college-b.nc', libelle_academie: 'Nouvelle Calédonie' },
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
    const sharedByManySchools = Array.from({ length: 3 }, () => ({ web: 'https://portail-ent.fr', libelle_academie: 'Lyon' }));

    addEducationWebsitesToRectorates(organizations, [
      { web: 'https://ville-vaulx.fr', libelle_academie: 'Lyon' }, // Already declared
      { web: 'https://reseau.fr', libelle_academie: 'Lyon' }, // Across academies
      { web: 'https://reseau.fr', libelle_academie: 'Nice' },
      { web: 'https://ville-vaulx.fr/ecole', libelle_academie: 'Lyon' }, // Not a home page
      ...sharedByManySchools,
    ]);

    expect(organizations.get('Rectorat - Académie de Lyon')?.domains).toStrictEqual([]);
    expect(organizations.get('Rectorat - Académie de Nice')?.domains).toStrictEqual([]);
  });
});
