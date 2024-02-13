import assert from 'assert';
import { Browser, Page, Response, chromium } from 'playwright';

import { BusinessDomainError, unexpectedDomainRedirectionError } from '@etabli/src/models/entities/errors';

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

export const toolsWithUnguessableWebsiteTitles = {
  storybook: / ⋅ Storybook$/, // It was complicated because Storybook titles include stories so the story tree will be the common pattern using `Components / Common / CoordonneesIcone - No Icone ⋅ Storybook` and `Components / Common / CoordonneesIcone - Icone ⋅ Storybook`
};

export function guessWebsiteNameFromPageTitles(title1: string, title2: string): string | null {
  // For known tools like Storybook or so that break with our guess logic, we hardcode the usage
  for (const [tool, regex] of Object.entries(toolsWithUnguessableWebsiteTitles)) {
    if (regex.test(title1) && regex.test(title2)) {
      // Like that the website name will be based on other things (we do not return tool name because to distinguish them)
      return null;
    }
  }

  // We tried a common substring library but it worked well considering characters, not words (ref: https://github.com/hanwencheng/CommonSubstrings/issues/11)
  // So needed to do our own logic since we didn't find the appropriate library
  const words1 = title1.split(' ');
  const words2 = title2.split(' ');

  let commonSubstring = '';

  for (let i = 0; i < words1.length; i++) {
    for (let j = 0; j < words2.length; j++) {
      let tempSubstring = '';
      let x = i;
      let y = j;

      while (x < words1.length && y < words2.length && words1[x] === words2[y]) {
        tempSubstring += words1[x] + ' ';
        x++;
        y++;
      }

      if (tempSubstring.split(' ').length > commonSubstring.split(' ').length) {
        commonSubstring = tempSubstring;
      }
    }
  }

  // We make sure to trim spaces and isolated special characters when there is a space like in `- react-dsfr` (can be at start or at the end)
  const commonTitle = commonSubstring.replace(/^\s*[^\w]+\s+|\s+[^\w]+\s*$/g, '').trim();

  return commonTitle !== '' ? commonTitle : null;
}
