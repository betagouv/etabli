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
