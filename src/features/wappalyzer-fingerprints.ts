import fs from 'fs/promises';
import path from 'path';
// The core of the library holds the fingerprints in a shared state, the same that its driver reads when analyzing a website
import WappalyzerCore from 'wappalyzer/wappalyzer';

import { downloadFile, isFileOutdated } from '@etabli/src/common';

// Wappalyzer closed its sources in 2023, so its npm package is frozen with its fingerprints of that time. Its engine still works and
// "enthec/webappanalyzer" maintains the same JSON format. They are GPL-3.0 whereas this project is MIT, so they are downloaded
// when running and not embedded into the repository
const remoteBaseUrl = 'https://raw.githubusercontent.com/enthec/webappanalyzer/main/src';
const localDirectory = path.resolve(process.cwd(), './data/wappalyzer');
const technologiesFiles = [...'_abcdefghijklmnopqrstuvwxyz'].map((letter) => `technologies/${letter}.json`);
const categoriesFile = 'categories.json';

type Fingerprints = Record<string, Record<string, unknown>>;

export function fixFingerprints(technologies: Fingerprints): Fingerprints {
  const fixedTechnologies = { ...technologies };

  // Its pattern matches any script mentioning "piwik", so websites using Matomo (formerly Piwik) are seen as using this commercial
  // product (and since it excludes Matomo, they are no longer seen as using Matomo). The domain of the product is the reliable part
  if (fixedTechnologies['Piwik PRO Core']) {
    const piwikPro = { ...fixedTechnologies['Piwik PRO Core'] };
    delete piwikPro.scripts;

    fixedTechnologies['Piwik PRO Core'] = piwikPro;
  }

  return fixedTechnologies;
}

async function saveFingerprintsFile(file: string): Promise<void> {
  const localPath = path.resolve(localDirectory, file);

  if (await isFileOutdated(localPath)) {
    await downloadFile(`${remoteBaseUrl}/${file}`, localPath);
  }
}

// Must be called before analyzing websites. If it cannot be done, the analysis still works with the fingerprints embedded in the package
export async function loadLatestWappalyzerFingerprints(): Promise<void> {
  try {
    const technologies: Fingerprints = {};
    for (const file of technologiesFiles) {
      await saveFingerprintsFile(file);

      Object.assign(technologies, JSON.parse(await fs.readFile(path.resolve(localDirectory, file), 'utf-8')));
    }

    await saveFingerprintsFile(categoriesFile);

    // The package has already registered its own fingerprints, and these 2 lists would be merged in a way that breaks the analysis
    WappalyzerCore.requires = [];
    WappalyzerCore.categoryRequires = [];

    WappalyzerCore.setTechnologies(fixFingerprints(technologies));
    WappalyzerCore.setCategories(JSON.parse(await fs.readFile(path.resolve(localDirectory, categoriesFile), 'utf-8')));

    console.log(`using ${Object.keys(technologies).length} community fingerprints for the websites analysis`);
  } catch (error) {
    console.warn(`the community fingerprints cannot be used, falling back on those of the package`);
    console.warn(error);
  }
}
