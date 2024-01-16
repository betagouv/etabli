import assert from 'assert';
import substrings from 'common-substrings';
import { Browser, Page, chromium } from 'playwright';

import { BusinessDomainError, unexpectedDomainRedirectionError } from '@etabli/models/entities/errors';

export interface getWebsiteDataResponse {
  status: number;
  html: string;
  title: string | null;
  headers: {
    [key: string]: string;
  };
}

export async function getWebsiteData(url: string): Promise<getWebsiteDataResponse> {
  console.log(`getting the page content of ${url}`);

  const browser: Browser = await chromium.launch();
  const page: Page = await browser.newPage();

  const response = await page.goto(url);
  assert(response);

  await page.waitForTimeout(2000); // Wait for JS to init page (in case it's needed)

  // We want to prevent redirection on another domain to keep integrity but we let pathname redirection pass, so looking at domain only
  const originalUrl = new URL(url);
  const resultingUrl = new URL(await page.evaluate(() => document.location.href));
  if (resultingUrl.host !== originalUrl.host) {
    throw new BusinessDomainError(unexpectedDomainRedirectionError, resultingUrl.hostname);
  }

  const html: string = await page.content();
  const title = await page.title();
  const status = response.status();
  const headers = response.headers();

  await browser.close();

  return {
    status: status,
    html: html,
    title: title !== '' ? title : null,
    headers: headers,
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

  // We make sure to trim spaces and isolated special characters when there is a space like in `- react-dsfr` (can be at start or at the end)
  return mainCommonPattern.replace(/^\s*[^\w]+\s+|\s+[^\w]+\s*$/g, '').trim();
}
