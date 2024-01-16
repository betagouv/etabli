import assert from 'assert';
import substrings from 'common-substrings';
import { Browser, Page, Response, chromium } from 'playwright';

import { BusinessDomainError, unexpectedDomainRedirectionError } from '@etabli/models/entities/errors';

export interface getWebsiteDataResponse {
  status: number;
  html: string;
  title: string | null;
  headers: {
    [key: string]: string;
  };
  redirectTargetUrl: URL | null;
}

export async function getWebsiteData(url: string): Promise<getWebsiteDataResponse> {
  console.log(`getting the page content of ${url}`);

  const browser: Browser = await chromium.launch();
  const page: Page = await browser.newPage();

  const response = await new Promise<Response | null>((resolve, reject) => {
    let errorWithDetailsIntoListener: {
      errorText: string;
    } | null = null;

    // When an error is thrown from `.goto()` it cannot be destructured to get technical details
    // So we hack a bit by looking for last request failed error that has details to throw them instead
    // Note: `requestfailed` notifies about error loading into the page itself, which is problematic so we do not throw from here to be sure it's a fatal error
    page.on('requestfailed', (request) => {
      errorWithDetailsIntoListener = request.failure();
    });

    page
      .goto(url)
      .then((res) => {
        resolve(res);
      })
      .catch((error) => {
        if (errorWithDetailsIntoListener) {
          reject(errorWithDetailsIntoListener);
        } else {
          reject(error);
        }
      });
  });

  assert(response);

  await page.waitForTimeout(2000); // Wait for JS to init page (in case it's needed)

  // We want to prevent redirection on another domain to keep integrity but we let pathname redirection pass, so looking at domain only
  const originalUrl = new URL(url);
  const resultingRawUrl = await page.evaluate(() => document.location.href);
  const resultingUrl = new URL(resultingRawUrl);
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
    redirectTargetUrl: originalUrl.toString() !== resultingUrl.toString() ? resultingUrl : null,
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
