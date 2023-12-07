import fsSync from 'fs';
import path from 'path';

import { downloadFile } from '@etabli/common';

export const latestRemoteCsvUrl =
  'https://gitlab.adullact.net/dinum/noms-de-domaine-organismes-secteur-public/-/raw/master/domains.csv?ref_type=heads';
export const localCsvPath = path.resolve(__dirname, '../../data/domains.csv');

export async function saveDomainCsvFile(cache: boolean = true) {
  if (!cache || !fsSync.existsSync(localCsvPath)) {
    await downloadFile(latestRemoteCsvUrl, localCsvPath);
  }
}
