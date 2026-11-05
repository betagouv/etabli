/**
 * @jest-environment node
 */
import { getMergedInitiativeMapsIdentifiers } from '@etabli/src/utils/initiative-map';

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
