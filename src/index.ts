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

export async function main() {
  // Cannot be imported directly due because it needs `"type": "module"` but Playwright cannot work with it
  const { $ } = await import('execa');

  const initiativeToProcess = initiatives[0];

  console.log('starting gathering information');

  // Get content
  const projectDirectory = path.resolve(__dirname, '../data/');
  const htmlPath = path.resolve(projectDirectory, 'website.html');

  if (!fsSync.existsSync(htmlPath)) {
    fs.mkdir(projectDirectory, { recursive: true });

    const tmpHtmlContent = await getHTML(initiativeToProcess.websiteUrl);
    fs.writeFile(htmlPath, tmpHtmlContent, {});
  }

  // Reduce content by using `pandoc` to save tokens on GPT
  const noImgAndSvgFilterPath = path.resolve(__dirname, '../src/pandoc/no-img-and-svg.lua');
  const extractMetaDescriptionFilterPath = path.resolve(__dirname, '../src/pandoc/extract-meta-description.lua');

  const markdownPath = path.resolve(projectDirectory, 'website.md');

  await $`pandoc ${htmlPath} --lua-filter ${noImgAndSvgFilterPath} --lua-filter ${extractMetaDescriptionFilterPath} -t gfm-raw_html -o ${markdownPath}`;
}

main();
