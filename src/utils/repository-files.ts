import { execa } from 'execa';
import fastFolderSize from 'fast-folder-size';
import { SimpleGit } from 'simple-git';
import { promisify } from 'util';

import manifestsEndingPatterns from '@etabli/src/bibliothecary/manifests-patterns.json';
import { languagesExtensions } from '@etabli/src/utils/languages';

const fastFolderSizeAsync = promisify(fastFolderSize);

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
  abortSignal: AbortSignal
): Promise<{ filesToAnalyze: string[]; downloadedSize: number }> {
  // An empty repository has no branch at all, so there is no tree to read and nothing to download (the description of the repository is used instead,
  // as for any repository without file to analyze). Any other problem (not a repository, corrupted objects...) still fails below
  const branches = await git.raw(['for-each-ref', '--count=1', '--format=%(refname)', 'refs/heads/']);

  if (branches.trim() === '') {
    return { filesToAnalyze: [], downloadedSize: (await fastFolderSizeAsync(folderPath)) ?? 0 };
  }

  const filesToDownload = parseGitTreeEntries(await git.raw(['ls-tree', '-r', '-z', '--full-tree', 'HEAD'])).filter(isRepositoryFileToAnalyze);

  if (filesToDownload.length === 0) {
    return { filesToAnalyze: [], downloadedSize: (await fastFolderSizeAsync(folderPath)) ?? 0 };
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

  const downloadedSize = (await fastFolderSizeAsync(folderPath)) ?? 0;

  // The index is filled from the tree so the paths can be given to `checkout-index`, it looks them up directly instead of comparing each of them
  // with each file as a pathspec would do (taking hours on repositories having hundreds of thousands of files)
  await git.raw(['read-tree', 'HEAD']);
  await execa('git', ['checkout-index', '-z', '--stdin'], {
    cwd: folderPath,
    input: filesToDownload.map((file) => file.filePath).join('\0'),
  });

  return { filesToAnalyze: filesToDownload.map((file) => file.filePath), downloadedSize: downloadedSize };
}
