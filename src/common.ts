import fs from 'fs/promises';

export async function downloadFile(url: string, destination: string): Promise<void> {
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`Failed to download file: ${response.status} ${response.statusText}`);
  }

  const content = await response.arrayBuffer();
  await fs.writeFile(destination, new Uint8Array(content));
}
