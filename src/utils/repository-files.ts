import { execa } from 'execa';
import fs from 'fs/promises';
import path from 'path';
import { SimpleGit } from 'simple-git';

import manifestsEndingPatterns from '@etabli/src/bibliothecary/manifests-patterns.json';
import { languagesExtensions } from '@etabli/src/utils/languages';

export const filesToKeepGitEndingPatterns: (string | RegExp)[] = [
  // Only the files used by the analyses are downloaded
  // Notes:
  // - only keep programming files and manifests since that what we only use for now (in addition to README files)
  // - with the current patterns we cannot rely on using leading `/` for the root, we should convert them to regexp otherwise
  /readme$/i,
  /readme\.txt$/i,
  /readme\.md$/i,
  ...manifestsEndingPatterns,
  ...languagesExtensions,
];

export interface GitTreeEntry {
  mode: string;
  objectId: string;
  filePath: string;
}

// Parses `git ls-tree -r -z --full-tree HEAD`, each entry being `<mode> <type> <object>\t<path>` (the path can contain any character, even a tab or a line break)
// Note: the size option (`-l`) must not be used, on a partial clone Git downloads each file one by one to know its size
export function parseGitTreeEntries(lsTreeOutput: string): GitTreeEntry[] {
  return lsTreeOutput
    .split('\0')
    .filter((entry) => entry !== '')
    .map((entry) => {
      const separatorIndex = entry.indexOf('\t');
      const [mode, , objectId] = entry.slice(0, separatorIndex).split(' ');

      return {
        mode: mode,
        objectId: objectId,
        filePath: entry.slice(separatorIndex + 1),
      };
    });
}

// Sums the output of `git cat-file --batch-check='%(objectsize)'`, a line per object (`<object> missing` when not downloaded, counted as nothing)
export function sumGitObjectsSizes(catFileOutput: string): number {
  return catFileOutput
    .split('\n')
    .filter((line) => /^\d+$/.test(line.trim()))
    .reduce((total, line) => total + Number(line.trim()), 0);
}

export class RepositoryFilesTooLargeError extends Error {}

// What has been downloaded so far, including the pack being received (`.git/objects/pack/tmp_pack_*`). It only reads a few entries since a partial clone
// keeps its objects into packs, whereas measuring the whole folder walks every file written by the checkout (it took minutes on hundreds of thousands of files)
export async function getGitObjectsSize(repositoryPath: string): Promise<number> {
  const sizeOf = async (folderPath: string): Promise<number> => {
    const entries = await fs.readdir(folderPath, { withFileTypes: true }).catch(() => []);
    let size = 0;

    for (const entry of entries) {
      const entryPath = path.resolve(folderPath, entry.name);

      if (entry.isDirectory()) {
        size += await sizeOf(entryPath);
      } else {
        // A temporary pack is renamed once received, so it may have disappeared between both calls
        size += (await fs.lstat(entryPath).catch(() => null))?.size ?? 0;
      }
    }

    return size;
  };

  return await sizeOf(path.resolve(repositoryPath, '.git/objects'));
}

export function isRepositoryFileToAnalyze(entry: GitTreeEntry): boolean {
  // Only regular files (`100644` and `100755`): a symbolic link (`120000`) likely points to nowhere (probably for libraries...), and a submodule (`160000`) is not cloned
  if (entry.mode !== '100644' && entry.mode !== '100755') {
    return false;
  }

  // Keep files having an allowed pattern (since they should have meaningful content to analyze)
  if (
    !filesToKeepGitEndingPatterns.some((endingPattern): boolean => {
      if (endingPattern instanceof RegExp) {
        return endingPattern.test(entry.filePath);
      } else {
        return entry.filePath.endsWith(endingPattern);
      }
    })
  ) {
    return false;
  }

  // After analyzing many repositories it seems programmatic files placed under a `public` or `assets` folder are always about third-party things, so we don't want to analyze them
  const rootedFilePath = `/${entry.filePath}`;

  return !rootedFilePath.includes('/public/') && !rootedFilePath.includes('/assets/');
}

// To be called on a repository cloned with `--no-checkout --filter=blob:none`: only the tree of paths is there, so the content of the files
// to analyze is downloaded and written to the disk, and nothing else
export async function downloadRepositoryFilesToAnalyze(
  git: SimpleGit,
  folderPath: string,
  abortSignal: AbortSignal,
  maximumFilesSize: number
): Promise<{ filesToAnalyze: string[]; downloadedSize: number }> {
  // An empty repository has no branch at all, so there is no tree to read and nothing to download (the description of the repository is used instead,
  // as for any repository without file to analyze). Any other problem (not a repository, corrupted objects...) still fails below
  const branches = await git.raw(['for-each-ref', '--count=1', '--format=%(refname)', 'refs/heads/']);

  if (branches.trim() === '') {
    return { filesToAnalyze: [], downloadedSize: await getGitObjectsSize(folderPath) };
  }

  const filesToDownload = parseGitTreeEntries(await git.raw(['ls-tree', '-r', '-z', '--full-tree', 'HEAD'])).filter(isRepositoryFileToAnalyze);

  if (filesToDownload.length === 0) {
    return { filesToAnalyze: [], downloadedSize: await getGitObjectsSize(folderPath) };
  }

  // This is the request Git does by itself when a file missing from a partial clone is read, but for all the needed files at once
  // (otherwise reading them would make one request per file, taking minutes for a common repository)
  await execa(
    'git',
    [
      '-c',
      'fetch.negotiationAlgorithm=noop',
      'fetch',
      'origin',
      '--no-tags',
      '--no-write-fetch-head',
      '--recurse-submodules=no',
      '--filter=blob:none',
      '--stdin',
    ],
    {
      cwd: folderPath,
      input: filesToDownload.map((file) => file.objectId).join('\n'),
      env: { ...process.env, GIT_TERMINAL_PROMPT: '0', GIT_ASKPASS: '' }, // No credentials prompt (IDEs like `vscode` set `GIT_ASKPASS`)
      signal: abortSignal,
    }
  );

  const downloadedSize = await getGitObjectsSize(folderPath);

  // The content is compressed while downloaded and several times bigger once written, so the size of the files is checked before the checkout
  // (the downloads are limited by the caller while they happen). The files are now local, and Git must not download a missing one to measure it
  const filesSize = sumGitObjectsSizes(
    (
      await execa('git', ['cat-file', '--batch-check=%(objectsize)'], {
        cwd: folderPath,
        input: filesToDownload.map((file) => file.objectId).join('\n'),
        env: { ...process.env, GIT_NO_LAZY_FETCH: '1' },
      })
    ).stdout
  );

  if (filesSize > maximumFilesSize) {
    throw new RepositoryFilesTooLargeError(`the files to analyze weigh ${filesSize} bytes once written, over the limit of ${maximumFilesSize} bytes`);
  }

  // The index is filled from the tree so the paths can be given to `checkout-index`, it looks them up directly instead of comparing each of them
  // with each file as a pathspec would do (taking hours on repositories having hundreds of thousands of files)
  await git.raw(['read-tree', 'HEAD']);
  // Forced since on a case-insensitive filesystem two paths can be the same file (`README.md` and `readme.md`), the last one is kept instead of failing
  await execa('git', ['checkout-index', '-f', '-z', '--stdin'], {
    cwd: folderPath,
    input: filesToDownload.map((file) => file.filePath).join('\0'),
  });

  return { filesToAnalyze: filesToDownload.map((file) => file.filePath), downloadedSize: downloadedSize };
}
