/**
 * @jest-environment node
 */
import { InitiativeOrganizationSchemaType } from '@etabli/src/models/entities/organization';
import {
  buildOrganizationTree,
  formatOrganizationPath,
  getShortOrganizationName,
  getSummaryOrganization,
  getUnclassifiedExplanation,
  summarizeOrganizations,
} from '@etabli/src/utils/organization';

const central = { id: '00000000-0000-0000-0000-000000000001', name: 'Administration centrale', acronym: null };
const government = { id: '00000000-0000-0000-0000-000000000002', name: 'Gouvernement', acronym: null };
const ministry = { id: '00000000-0000-0000-0000-000000000003', name: 'Ministère', acronym: null };
const direction = { id: '00000000-0000-0000-0000-000000000004', name: 'Direction', acronym: 'DIR' };

const team: InitiativeOrganizationSchemaType = {
  id: '00000000-0000-0000-0000-000000000005',
  name: 'Équipe',
  acronym: null,
  level: 5,
  directoryUrl: null,
  ancestors: [central, government, ministry, direction],
};

const otherTeam: InitiativeOrganizationSchemaType = {
  ...team,
  id: '00000000-0000-0000-0000-000000000006',
  name: 'Autre équipe',
};

const townHall: InitiativeOrganizationSchemaType = {
  id: '00000000-0000-0000-0000-000000000007',
  name: 'Mairie',
  acronym: null,
  level: 1,
  directoryUrl: null,
  ancestors: [],
};

describe('formatOrganizationPath()', () => {
  it('should list the whole branch', () => {
    expect(formatOrganizationPath(team)).toBe('Administration centrale › Gouvernement › Ministère › Direction › Équipe');
  });
});

describe('getSummaryOrganization()', () => {
  it('should summarize with the ministry level', () => {
    expect(getSummaryOrganization(team)).toStrictEqual(ministry);
  });

  it('should keep standalone organizations as they are', () => {
    expect(getSummaryOrganization(townHall).id).toBe(townHall.id);
  });

  it('should display the focused organization when more precise', () => {
    expect(getSummaryOrganization(team, [direction.id])).toStrictEqual(direction);
    expect(getSummaryOrganization(team, [team.id]).id).toBe(team.id);
  });

  it('should ignore a focus on generic upper levels', () => {
    expect(getSummaryOrganization(team, [government.id])).toStrictEqual(ministry);
  });
});

describe('summarizeOrganizations()', () => {
  it('should merge organizations summarized by the same one', () => {
    const summaries = summarizeOrganizations([team, otherTeam, townHall]);

    expect(summaries.map((summary) => summary.organization.id)).toStrictEqual([ministry.id, townHall.id]);
    expect(summaries[0].paths).toHaveLength(2);
  });
});

describe('buildOrganizationTree()', () => {
  it('should merge shared ancestors and flag bound organizations', () => {
    const summaries = summarizeOrganizations([team, otherTeam]);
    const tree = buildOrganizationTree(summaries[0].paths);

    expect(tree).toHaveLength(1);
    expect(tree[0].organization.id).toBe(central.id);
    expect(tree[0].isBound).toBe(false);

    const directionNode = tree[0].children[0].children[0].children[0];
    expect(directionNode.organization.id).toBe(direction.id);
    expect(directionNode.level).toBe(4);
    expect(directionNode.children.map((child) => [child.organization.id, child.isBound])).toStrictEqual([
      [team.id, true],
      [otherTeam.id, true],
    ]);
  });
});

describe('getShortOrganizationName()', () => {
  it('should prefer the acronym and remove generic prefixes', () => {
    expect(getShortOrganizationName({ name: 'Direction interministérielle du numérique (DINUM)', acronym: 'DINUM' })).toBe('DINUM');
    expect(getShortOrganizationName({ name: "Ministère de l’Enseignement supérieur, de la Recherche et de l'Espace", acronym: null })).toBe(
      "Enseignement supérieur, de la Recherche et de l'Espace"
    );
    expect(getShortOrganizationName({ name: 'Ministère des Armées', acronym: null })).toBe('Armées');
    expect(getShortOrganizationName({ name: 'Auvergne-Rhône-Alpes', acronym: null })).toBe('Auvergne-Rhône-Alpes');
  });
});

describe('getUnclassifiedExplanation()', () => {
  it('should only mention what the initiative has', () => {
    expect(getUnclassifiedExplanation(1, 0)).toContain('à partir du site internet de cette');
    expect(getUnclassifiedExplanation(0, 3)).toContain('à partir des dépôts de code de cette');
    expect(getUnclassifiedExplanation(2, 1)).toContain('à partir des sites internet et du dépôt de code de cette');
  });
});
