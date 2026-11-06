/**
 * @jest-environment node
 */
import { layoutOrganizationsMap } from '@etabli/src/utils/organizations-map';

const noInitiatives = { websitesOnly: 0, repositoriesOnly: 0, both: 0 };

function toItem(id: string, parentId: string | null, websites: number, isHierarchyRoot = false) {
  const own = { ...noInitiatives, websitesOnly: websites };

  return {
    id: id,
    parentId: parentId,
    name: id,
    acronym: null,
    level: parentId ? 2 : 1,
    isHierarchyRoot: isHierarchyRoot,
    isTerritorial: false,
    composition: own,
    own: own,
    ownWeights: own,
  };
}

describe('layoutOrganizationsMap()', () => {
  it('should give the same size to organizations having as many initiatives, however they are split', () => {
    const fewBigOnes = ['a', 'b'].map((id) => toItem(id, 'central', 500));
    const manySmallOnes = Array.from({ length: 1000 }, (_, index) => toItem(`local-${index}`, 'local', 1));

    const root = layoutOrganizationsMap({
      organizations: [toItem('central', null, 0, true), toItem('local', null, 0, true), ...fewBigOnes, ...manySmallOnes],
      composition: noInitiatives,
      standalone: noInitiatives,
      unclassified: noInitiatives,
    });

    const [first, second] = root.children ?? [];

    expect(first.r).toBeCloseTo(second.r, 5);
  });
});
