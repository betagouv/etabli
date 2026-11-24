/**
 * @jest-environment node
 */
import { describe, expect, it } from '@jest/globals';

import { isDirectoryIndexable, loadDirectoryParams } from '@etabli/src/utils/initiatives-directory';

const organizationId = '0b6b0d5c-3a3c-4b36-9d6e-1f0f4f2a8b11';

describe('isDirectoryIndexable()', () => {
  it('should index the whole directory and its pages', () => {
    expect(isDirectoryIndexable(loadDirectoryParams({}))).toBe(true);
    expect(isDirectoryIndexable(loadDirectoryParams({ page: '3' }))).toBe(true);
    expect(isDirectoryIndexable(loadDirectoryParams({ page: '1', sort: 'relevance' }))).toBe(true); // Default values
  });

  it('should not index searches', () => {
    expect(isDirectoryIndexable(loadDirectoryParams({ q: 'Défi de rapidité et de stratégie' }))).toBe(false);
  });

  it('should not index filters or sortings', () => {
    expect(isDirectoryIndexable(loadDirectoryParams({ orgs: organizationId }))).toBe(false);
    expect(isDirectoryIndexable(loadDirectoryParams({ tools: organizationId }))).toBe(false);
    expect(isDirectoryIndexable(loadDirectoryParams({ fnc: 'GENERATES_PDF' }))).toBe(false);
    expect(isDirectoryIndexable(loadDirectoryParams({ hasWeb: 'true' }))).toBe(false);
    expect(isDirectoryIndexable(loadDirectoryParams({ sort: 'name' }))).toBe(false);
    expect(isDirectoryIndexable(loadDirectoryParams({ view: 'map' }))).toBe(false);
    expect(isDirectoryIndexable(loadDirectoryParams({ orgs: organizationId, page: '3' }))).toBe(false);
  });
});
