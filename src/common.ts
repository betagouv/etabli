import fs from 'fs/promises';
import path from 'path';

export async function downloadFile(url: string, destination: string, timeout?: number): Promise<void> {
  const response = await fetch(url, {
    signal: timeout ? AbortSignal.timeout(timeout) : undefined,
  });

  if (!response.ok) {
    throw new Error(`Failed to download file: ${response.status} ${response.statusText}`);
  }

  const content = await response.arrayBuffer();

  await fs.mkdir(path.dirname(destination), { recursive: true });
  await fs.writeFile(destination, new Uint8Array(content));
}

// Source files do not need to be downloaded on each run, but they must not stay the same forever either
export const maximumDownloadedFileAgeInDays = 30;

export async function isFileOutdated(filePath: string): Promise<boolean> {
  try {
    const { mtime } = await fs.stat(filePath);

    return Date.now() - mtime.getTime() > maximumDownloadedFileAgeInDays * 24 * 60 * 60 * 1000;
  } catch (error) {
    return true; // It does not exist yet
  }
}
