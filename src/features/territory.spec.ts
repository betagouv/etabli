/**
 * @jest-environment node
 */
import {
  CommuneWebsiteMatcher,
  attachCommunesToIntercommunalities,
  attachStandaloneOrganizationsToTerritories,
  getDepartmentCode,
  parseOfficialCommunes,
} from '@etabli/src/features/territory';
import { LiteOrganizationSchemaType } from '@etabli/src/models/entities/organization';

function toOrganization(dilaId: string, name: string, parentDilaId: string | null = null, localServiceType: string | null = null) {
  return {
    dilaId: dilaId,
    parentDilaId: parentDilaId,
    ancestorDilaIds: parentDilaId ? [parentDilaId] : [],
    level: parentDilaId ? 2 : 1,
    name: name,
    acronym: null,
    domains: [],
    directoryUrl: null,
    localServiceType: localServiceType,
    isTerritorial: false,
  } as LiteOrganizationSchemaType;
}

describe('getDepartmentCode()', () => {
  it('should handle overseas and Corsica', () => {
    expect(getDepartmentCode('29019')).toBe('29');
    expect(getDepartmentCode('2A004')).toBe('2A');
    expect(getDepartmentCode('97105')).toBe('971');
  });
});

describe('attachStandaloneOrganizationsToTerritories()', () => {
  it('should only move standalone organizations under their department', () => {
    const organizations = new Map(
      [
        toOrganization('region', 'Bretagne'),
        toOrganization('department', 'Finistère - 29', 'region'),
        toOrganization('townHall', 'Mairie - Plouhinec', null, 'mairie'),
        toOrganization('prefecture', 'Préfecture - Finistère', 'department', 'prefecture'),
      ].map((organization) => [organization.dilaId, organization])
    );

    attachStandaloneOrganizationsToTerritories(
      organizations,
      new Map([
        ['townHall', '29197'],
        ['prefecture', '29232'],
      ])
    );

    expect(organizations.get('townHall')).toMatchObject({
      parentDilaId: 'department',
      ancestorDilaIds: ['region', 'department'],
      level: 3,
      isTerritorial: true,
    });
    expect(organizations.get('prefecture')?.isTerritorial).toBe(false);
  });
});

describe('attachCommunesToIntercommunalities()', () => {
  const directoryUrl = (id: string) => `https://lannuaire.service-public.gouv.fr/bretagne/finistere/${id}`;
  const townHallId = '076a433a-f1e2-4926-ba57-9d1bd1ed637a';
  const intercommunalityId = '12705004-0d2a-4b54-bc10-d6cef127f68a';

  it('should place a commune under its intercommunality and keep it territorial', () => {
    const townHall = { ...toOrganization(townHallId, 'Mairie - Plouhinec'), parentDilaId: 'department', ancestorDilaIds: ['department'], level: 2 };
    const intercommunality = {
      ...toOrganization(intercommunalityId, 'CC Cap Sizun'),
      parentDilaId: 'department',
      ancestorDilaIds: ['department'],
      level: 2,
    };
    townHall.isTerritorial = true;
    intercommunality.isTerritorial = true;

    const organizations = new Map([
      [townHallId, townHall],
      [intercommunalityId, intercommunality],
    ]);

    attachCommunesToIntercommunalities(organizations, [
      { type: 'commune', siren: '1', libelle: 'Plouhinec', site_internet: null, service_public_url: directoryUrl(townHallId), epci_siren: '2' },
      { type: 'epci', siren: '2', libelle: 'CC', site_internet: null, service_public_url: directoryUrl(intercommunalityId), epci_siren: null },
    ]);

    expect(organizations.get(townHallId)).toMatchObject({
      parentDilaId: intercommunalityId,
      ancestorDilaIds: ['department', intercommunalityId],
      level: 3,
      isTerritorial: true,
    });
  });
});

describe('parseOfficialCommunes()', () => {
  it('should deduce the directory identifier and keep communes only', () => {
    const url = 'https://lannuaire.service-public.gouv.fr/bretagne/finistere/076a433a-f1e2-4926-ba57-9d1bd1ed637a';

    expect(
      parseOfficialCommunes([
        { type: 'commune', siren: '1', libelle: 'Plouhinec', site_internet: null, service_public_url: url, epci_siren: null },
        { type: 'epci', siren: '2', libelle: 'CC', site_internet: null, service_public_url: url, epci_siren: null },
      ])
    ).toStrictEqual([{ dilaId: '076a433a-f1e2-4926-ba57-9d1bd1ed637a', name: 'Plouhinec', website: null }]);
  });
});

describe('CommuneWebsiteMatcher', () => {
  const matcher = new CommuneWebsiteMatcher([
    { dilaId: 'a', name: 'Trébeurden', website: null },
    { dilaId: 'b', name: 'Lézignan-la-Cèbe', website: 'https://www.lezignan.example.fr/' },
    { dilaId: 'c', name: 'Saint-Martin', website: null },
    { dilaId: 'd', name: 'Saint-Martin', website: null },
    { dilaId: 'e', name: 'Chabestan', website: null },
    { dilaId: 'f', name: 'Shared', website: 'https://espace-citoyens.net/a' },
    { dilaId: 'g', name: 'Other', website: 'https://espace-citoyens.net/b' },
  ]);

  it('should trust the official website', () => {
    expect(matcher.match('https://lezignan.example.fr', null)?.dilaId).toBe('b');
  });

  it('should require the name in both the domain and the page title', () => {
    expect(matcher.match('https://www.trebeurden.fr', 'Site officiel de la ville de Trébeurden')?.dilaId).toBe('a');
    expect(matcher.match('https://mairie-trebeurden22.fr', 'Trébeurden, ma commune')?.dilaId).toBe('a');
    expect(matcher.match('https://chabestan.com', 'Порно онлайн')).toBeNull();
    expect(matcher.match('https://www.trebeurden.fr', null)).toBeNull();
  });

  it('should not conclude on homonyms or shared hosts', () => {
    expect(matcher.match('https://saint-martin.fr', 'Saint-Martin')).toBeNull();
    expect(matcher.match('https://espace-citoyens.net', 'Shared')).toBeNull();
  });
});
