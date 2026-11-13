/**
 * @jest-environment node
 */
import { execa } from 'execa';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { simpleGit } from 'simple-git';

import {
  RepositoryFilesTooLargeError,
  downloadRepositoryFilesToAnalyze,
  getGitObjectsSize,
  isRepositoryFileToAnalyze,
  parseGitTreeEntries,
  sumGitObjectsSizes,
} from '@etabli/src/utils/repository-files';

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

describe('sumGitObjectsSizes()', () => {
  it('should sum the sizes and ignore the missing objects', async () => {
    expect(sumGitObjectsSizes(['120', '1048576', '3333333333333333333333333333333333333333 missing', ''].join('\n'))).toBe(1048696);
  });
});

describe('isRepositoryFileToAnalyze()', () => {
  const entry = (filePath: string, mode = '100644') => ({
    mode: mode,
    objectId: '1111111111111111111111111111111111111111',
    filePath: filePath,
  });

  it('should keep code, manifests and readme files', async () => {
    expect(isRepositoryFileToAnalyze(entry('src/index.ts'))).toBe(true);
    expect(isRepositoryFileToAnalyze(entry('scripts/run.js', '100755'))).toBe(true);
    expect(isRepositoryFileToAnalyze(entry('app/services/registration.py'))).toBe(true);
    expect(isRepositoryFileToAnalyze(entry('server/index.mjs'))).toBe(true);
    expect(isRepositoryFileToAnalyze(entry('src/solver.cc'))).toBe(true);
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

describe('downloadRepositoryFilesToAnalyze()', () => {
  let temporaryFolder: string;
  let sourceUrl: string;
  let codeFolderPath: string;

  beforeEach(async () => {
    temporaryFolder = await fs.mkdtemp(path.join(os.tmpdir(), 'etabli-repository-files-'));

    // A local repository served with partial clones allowed, like the forges do
    const sourcePath = path.join(temporaryFolder, 'source');
    await fs.mkdir(path.join(sourcePath, 'data'), { recursive: true });
    await fs.writeFile(path.join(sourcePath, 'README.md'), '# Project');
    await fs.writeFile(path.join(sourcePath, 'index.ts'), 'export const value = 1;\n'.repeat(1000));
    await fs.writeFile(path.join(sourcePath, 'data', 'corpus.csv'), 'a,b\n'.repeat(100_000));

    const git = (...args: string[]) => execa('git', args, { cwd: sourcePath });
    await git('init', '-q', '-b', 'main');
    await git('config', 'uploadpack.allowFilter', 'true');
    await git('add', '.');
    await git('-c', 'user.name=test', '-c', 'user.email=test@example.com', 'commit', '-q', '-m', 'init');

    sourceUrl = `file://${sourcePath}`;
    codeFolderPath = path.join(temporaryFolder, 'clone');
    await fs.mkdir(codeFolderPath);
    await simpleGit({ baseDir: codeFolderPath }).clone(sourceUrl, '.', {
      '--single-branch': null,
      '--depth': 1,
      '--no-checkout': null,
      '--filter': 'blob:none',
    });
  });

  afterEach(async () => {
    await fs.rm(temporaryFolder, { recursive: true, force: true });
  });

  it('should only download and write the files to analyze, measuring what has been downloaded', async () => {
    const sizeBefore = await getGitObjectsSize(codeFolderPath);
    expect(sizeBefore).toBeGreaterThan(0);

    const result = await downloadRepositoryFilesToAnalyze(
      simpleGit({ baseDir: codeFolderPath }),
      codeFolderPath,
      new AbortController().signal,
      1024 * 1024
    );

    expect(result.filesToAnalyze.sort()).toEqual(['README.md', 'index.ts']);
    expect(result.downloadedSize).toBeGreaterThan(sizeBefore);
    expect(result.downloadedSize).toBe(await getGitObjectsSize(codeFolderPath));
    await expect(fs.access(path.join(codeFolderPath, 'index.ts'))).resolves.toBeUndefined();
    await expect(fs.access(path.join(codeFolderPath, 'data', 'corpus.csv'))).rejects.toThrow();

    // The partial clone is kept: the content of the other files has never been downloaded, even to measure the sizes
    const objectsState = await execa('git', ['cat-file', '--batch-check=%(objectname) %(objecttype)'], {
      cwd: codeFolderPath,
      input: ['HEAD:index.ts', 'HEAD:README.md', 'HEAD:data/corpus.csv'].join('\n'),
      env: { ...process.env, GIT_NO_LAZY_FETCH: '1' },
    });
    const objectsLines = objectsState.stdout.split('\n');

    expect(objectsLines[0]).toMatch(/ blob$/);
    expect(objectsLines[1]).toMatch(/ blob$/);
    expect(objectsLines[2]).toMatch(/ missing$/);
  });

  it('should refuse before writing the files to analyze when they are too big once written', async () => {
    // `index.ts` weighs 24 KB uncompressed, much more than once compressed
    await expect(
      downloadRepositoryFilesToAnalyze(simpleGit({ baseDir: codeFolderPath }), codeFolderPath, new AbortController().signal, 10_000)
    ).rejects.toThrow(RepositoryFilesTooLargeError);
    await expect(fs.access(path.join(codeFolderPath, 'index.ts'))).rejects.toThrow();
  });
});

describe('getGitObjectsSize()', () => {
  it('should be zero when there is no repository yet', async () => {
    expect(await getGitObjectsSize(path.join(os.tmpdir(), 'etabli-missing-folder'))).toBe(0);
  });
});
