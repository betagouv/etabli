import AdmZip from 'adm-zip';
import fsSync from 'fs';
import fs from 'fs/promises';
import path from 'path';
import { Browser, Page, chromium } from 'playwright';

export interface Initiative {
  name: string;
  repositoryUrl: string;
  websiteUrl: string;
}

// Initiatives listed are for now all monorepository using typescript
// (will evolve if the proof of concept is a success)
export const initiatives: Initiative[] = [
  {
    name: 'Médiature',
    repositoryUrl: 'https://github.com/inclusion-numerique/mediature',
    websiteUrl: 'https://www.mediateur-public.fr/',
  },
  {
    name: 'Aides Jeunes',
    repositoryUrl: 'https://github.com/betagouv/aides-jeunes',
    websiteUrl: 'https://www.1jeune1solution.gouv.fr/mes-aides',
  },
  {
    name: 'Mon compte pro',
    repositoryUrl: 'https://github.com/betagouv/moncomptepro',
    websiteUrl: 'https://moncomptepro.beta.gouv.fr/',
  },
  {
    name: 'Territoires en transitions',
    repositoryUrl: 'https://github.com/betagouv/territoires-en-transitions',
    websiteUrl: 'https://www.territoiresentransitions.fr/',
  },
  {
    name: 'France chaleur urbaine',
    repositoryUrl: 'https://github.com/betagouv/france-chaleur-urbaine',
    websiteUrl: 'https://france-chaleur-urbaine.beta.gouv.fr/',
  },
  {
    name: 'Preuve covoiturage',
    repositoryUrl: 'https://github.com/betagouv/preuve-covoiturage',
    websiteUrl: 'https://app.covoiturage.beta.gouv.fr/',
  },
];

export async function getHTML(url: string): Promise<string> {
  console.log('getting website HTML content');

  const browser: Browser = await chromium.launch();
  const page: Page = await browser.newPage();

  await page.goto(url);
  await page.waitForTimeout(2000); // Wait for JS to init page (in case it's needed)

  const html: string = await page.content();

  await browser.close();

  return html;
}

export async function downloadFile(url: string, destination: string): Promise<void> {
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`Failed to download file: ${response.status} ${response.statusText}`);
  }

  const content = await response.arrayBuffer();
  await fs.writeFile(destination, new Uint8Array(content));
}

export async function main() {
  // Cannot be imported directly due because it needs `"type": "module"` but Playwright cannot work with it
  const { $ } = await import('execa');

  const initiativeToProcess = initiatives[0];

  console.log('starting gathering information');

  // Define unique ID for this project
  // TODO: should a merged of production website URL and main repository (don't know how to calculate it right now) + be compatible with filename format
  const projectId = initiativeToProcess.name;

  // Get content
  const projectDirectory = path.resolve(__dirname, '../data/', projectId);
  const htmlPath = path.resolve(projectDirectory, 'website.html');

  if (!fsSync.existsSync(htmlPath)) {
    fs.mkdir(projectDirectory, { recursive: true });

    const tmpHtmlContent = await getHTML(initiativeToProcess.websiteUrl);
    fs.writeFile(htmlPath, tmpHtmlContent, {});
  }

  // Reduce content by using `pandoc` to save tokens on GPT
  const markdownPath = path.resolve(projectDirectory, 'website.md');

  if (!fsSync.existsSync(markdownPath)) {
    const noImgAndSvgFilterPath = path.resolve(__dirname, '../src/pandoc/no-img-and-svg.lua');
    const extractMetaDescriptionFilterPath = path.resolve(__dirname, '../src/pandoc/extract-meta-description.lua');

    await $`pandoc ${htmlPath} --lua-filter ${noImgAndSvgFilterPath} --lua-filter ${extractMetaDescriptionFilterPath} -t gfm-raw_html -o ${markdownPath}`;
  }

  // Get the source code
  // TODO: only for Github for now, to adjust (using GitHub API domain helped not guessing the default branch)
  const repositoryUrl = new URL('https://github.com/inclusion-numerique/mediature');
  const sourceCodeZipUrl = `https://api.github.com/repos${repositoryUrl.pathname}/zipball`;
  const zipPath = path.resolve(projectDirectory, 'code.zip');

  if (!fsSync.existsSync(zipPath)) {
    const codeFolderPath = path.resolve(projectDirectory, 'code');

    await downloadFile(sourceCodeZipUrl, zipPath);

    const zip = new AdmZip(zipPath);
    zip.extractAllTo(codeFolderPath, true);
    // TODO: use async but requires intermediate promise (whereas they are "Promise" variants for other methods...)
    // zip.extractAllToAsync(codeFolderPath, true, () => {});
    // Note: it's unzipped in its own top folder
  }
}

main();
