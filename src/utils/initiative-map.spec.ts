/**
 * @jest-environment node
 */
import { getMainDestinationByRemovedMap, getMergedInitiativeMapsIdentifiers, getMovedInitiativeMaps } from '@etabli/src/utils/initiative-map';

const map = (mainItemIdentifier: string, rawDomainsIds: string[], rawRepositoriesIds: string[] = []) => ({
  mainItemIdentifier,
  rawDomainsIds,
  rawRepositoriesIds,
});

describe('getMergedInitiativeMapsIdentifiers()', () => {
  it('should detect maps whose items are now part of another map', () => {
    expect(getMergedInitiativeMapsIdentifiers([map('www', ['www'])], [map('apex', ['apex', 'www'])])).toStrictEqual(['www']);
  });

  it('should also consider repositories', () => {
    expect(getMergedInitiativeMapsIdentifiers([map('repo', [], ['repo'])], [map('site', ['site'], ['repo'])])).toStrictEqual(['repo']);
  });

  it('should keep maps whose items have disappeared', () => {
    expect(getMergedInitiativeMapsIdentifiers([map('gone', ['gone'])], [map('other', ['other'])])).toStrictEqual([]);
  });
});

describe('getMovedInitiativeMaps()', () => {
  it('should move the initiative when the main item of a group changes', () => {
    expect(getMovedInitiativeMaps([map('www', ['www', 'apex'])], [map('apex', ['www', 'apex'])])).toStrictEqual({
      moved: [{ fromMainItemIdentifier: 'www', toMainItemIdentifier: 'apex' }],
      duplicated: [],
    });
  });

  it('should also consider repositories', () => {
    expect(getMovedInitiativeMaps([map('repo', [], ['repo'])], [map('site', ['site'], ['repo'])]).moved).toStrictEqual([
      { fromMainItemIdentifier: 'repo', toMainItemIdentifier: 'site' },
    ]);
  });

  it('should ignore removed maps having nothing in common with new ones', () => {
    expect(getMovedInitiativeMaps([map('gone', ['gone'])], [map('new', ['new'])])).toStrictEqual({ moved: [], duplicated: [] });
  });

  it('should keep the initiative sharing the most items when several maps gather into a new one', () => {
    expect(getMovedInitiativeMaps([map('small', ['a']), map('big', ['b', 'c'])], [map('new', ['a', 'b', 'c'])])).toStrictEqual({
      moved: [{ fromMainItemIdentifier: 'big', toMainItemIdentifier: 'new' }],
      duplicated: ['small'],
    });
  });

  it('should move a split map to only one new map', () => {
    expect(getMovedInitiativeMaps([map('old', ['a', 'b', 'c'])], [map('first', ['a']), map('second', ['b', 'c'])])).toStrictEqual({
      moved: [{ fromMainItemIdentifier: 'old', toMainItemIdentifier: 'second' }],
      duplicated: [],
    });
  });
});

describe('getMainDestinationByRemovedMap()', () => {
  it('should tell the map that took most of the items of each removed one', () => {
    const destinations = getMainDestinationByRemovedMap(
      [map('merged', ['a', 'b', 'c']), map('gone', ['z'])],
      [map('small', ['small', 'a']), map('big', ['big', 'b', 'c'])]
    );

    expect([...destinations]).toStrictEqual([['merged', 'big']]);
  });

  it('should break ties on the identifier', () => {
    expect([...getMainDestinationByRemovedMap([map('merged', ['a', 'b'])], [map('second', ['b']), map('first', ['a'])])]).toStrictEqual([
      ['merged', 'first'],
    ]);
  });
});
