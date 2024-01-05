import assert from 'assert';
import substrings from 'common-substrings';
import { Browser, Page, chromium } from 'playwright';

export interface getWebsiteDataResponse {
  status: number;
  html: string;
  title: string;
}

export async function getWebsiteData(url: string): Promise<getWebsiteDataResponse> {
  console.log('getting website HTML content');

  const browser: Browser = await chromium.launch();
  const page: Page = await browser.newPage();

  const response = await page.goto(url);
  assert(response);

  await page.waitForTimeout(2000); // Wait for JS to init page (in case it's needed)

  const html: string = await page.content();
  const title = await page.title();
  const status = response.status();

  await browser.close();

  return {
    status: status,
    html: html,
    title: title,
  };
}

export function guessWebsiteNameFromPageTitles(title1: string, title2: string): string | null {
  const result = substrings([title1, title2], {
    minOccurrence: 2,
    minLength: 3,
  });

  if (result.length === 0) {
    return null;
  }

  const mainCommonPattern = result.sort((a, b) => b.weight - a.weight)[0].name;

  // We make sure to trim spaces and isolated special characters like in `- react-dsfr` (can be at start or at the end)
  return mainCommonPattern.replace(/^\s*[^\w]+|\s*[^\w]+\s*$/g, '').trim();
}
