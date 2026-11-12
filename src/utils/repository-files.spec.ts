/**
 * @jest-environment node
 */
import { isRepositoryFileToAnalyze, parseGitTreeEntries } from '@etabli/src/utils/repository-files';

describe('parseGitTreeEntries()', () => {
  it('should keep paths having any character', async () => {
    const output = [
      '100644 blob 1111111111111111111111111111111111111111\tsrc/index.ts',
      '100644 blob 2222222222222222222222222222222222222222\tweird\tname\nwith lines.py',
      '160000 commit 3333333333333333333333333333333333333333\tvendor/library',
      '',
    ].join('\0');

    expect(parseGitTreeEntries(output)).toEqual([
      { mode: '100644', objectId: '1111111111111111111111111111111111111111', filePath: 'src/index.ts' },
      { mode: '100644', objectId: '2222222222222222222222222222222222222222', filePath: 'weird\tname\nwith lines.py' },
      { mode: '160000', objectId: '3333333333333333333333333333333333333333', filePath: 'vendor/library' },
    ]);
  });
});

describe('isRepositoryFileToAnalyze()', () => {
  const entry = (filePath: string, mode = '100644') => ({ mode: mode, objectId: '1111111111111111111111111111111111111111', filePath: filePath });

  it('should keep code, manifests and readme files', async () => {
    expect(isRepositoryFileToAnalyze(entry('src/index.ts'))).toBe(true);
    expect(isRepositoryFileToAnalyze(entry('scripts/run.js', '100755'))).toBe(true);
    expect(isRepositoryFileToAnalyze(entry('package.json'))).toBe(true);
    expect(isRepositoryFileToAnalyze(entry('README.md'))).toBe(true);
    expect(isRepositoryFileToAnalyze(entry('Readme'))).toBe(true);
  });

  it('should skip other files, links and submodules', async () => {
    expect(isRepositoryFileToAnalyze(entry('images/logo.png'))).toBe(false);
    expect(isRepositoryFileToAnalyze(entry('data/corpus.csv'))).toBe(false);
    expect(isRepositoryFileToAnalyze(entry('src/link.ts', '120000'))).toBe(false);
    expect(isRepositoryFileToAnalyze(entry('vendor/library', '160000'))).toBe(false);
  });

  it('should skip what is under a public or assets folder', async () => {
    expect(isRepositoryFileToAnalyze(entry('public/vendor.js'))).toBe(false);
    expect(isRepositoryFileToAnalyze(entry('app/assets/script.js'))).toBe(false);
    expect(isRepositoryFileToAnalyze(entry('src/publication.ts'))).toBe(true);
  });
});
