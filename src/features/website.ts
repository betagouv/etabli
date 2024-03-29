import assert from 'assert';
import { WordTokenizer } from 'natural/lib/natural/tokenizers';
import { stopwords as englishStopwords } from 'natural/lib/natural/util';
import { words as frenchStopwords } from 'natural/lib/natural/util/stopwords_fr';
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

// We pass the browser from the parent since it's always used into loops and that launching + closing last for 600ms
export async function getWebsiteData(browser: Browser, url: string, timeoutForDomContentLoaded?: number): Promise<getWebsiteDataResponse> {
  console.log(`getting the page content of ${url}`);

  const page: Page = await browser.newPage({
    extraHTTPHeaders: {
      'Cache-Control': 'no-cache', // Tell the websites servers to not respond with a 304 status code that would use the local Chromium cache (we didn't find a simple way to disable it from Playwright settings)
    },
    userAgent:
      'Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; Googlebot/2.1; +http://www.google.com/bot.html) Chrome/W.X.Y.Z Safari/537.36', // Use an user agent that will be ignored by tracking analytics to not pollute (https://developers.google.com/search/docs/crawling-indexing/overview-google-crawlers#googlebot-desktop)
  });
  try {
    const response = await new Promise<Response | null>((resolve, reject) => {
      let errorWithDetailsIntoListener: Error | null = null;

      // When an error is thrown from `.goto()` it cannot be destructured to get technical details
      // So we hack a bit by looking for last request failed error that has details to throw them instead
      // Note: `requestfailed` notifies about error loading into the page itself, which is problematic so we do not throw from here to be sure it's a fatal error
      page.on('requestfailed', (request) => {
        const failure = request.failure();

        if (!!failure) {
          const errorMessage = `an error comes from the processing of Playwright for "${request.url()}" (which may just be an assert url when loading): ${
            failure.errorText
          }`;

          // Mimic errors format we can have we other network libraries to factorize the handling logic since here it's just pure "useless" text (have a look at `src/utils/request.ts`)
          if (failure.errorText.startsWith('net::')) {
            const errorToThrow = new Error(errorMessage);

            errorToThrow.cause = {
              code: failure.errorText,
            };

            errorWithDetailsIntoListener = errorToThrow;
          } else {
            errorWithDetailsIntoListener = new Error(errorMessage);
          }
        }
      });

      page
        .goto(url, {
          timeout: timeoutForDomContentLoaded,
          // This will wait for HTML to be parsed but also for all JavaScript synchronous script to be executed
          // It does not wait for CSS stylesheets so it's good for us (but the event `load` would do it, so it would be longer)
          // Note: as a reminder, to handle single page application (SPA) it was important to us to have scripts loaded (to then wait X seconds for it to be initialized)
          // Ref: https://developer.mozilla.org/en-US/docs/Web/API/Document/DOMContentLoaded_event
          waitUntil: 'domcontentloaded',
        })
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
    let resultingRawUrl: string = 'placeholder_for_now';

    const maximumAttemptsToGetResultingUrl = 2;
    for (let i = 0; i < maximumAttemptsToGetResultingUrl; i++) {
      try {
        resultingRawUrl = await page.evaluate(() => document.location.href);

        break;
      } catch (error) {
        if (
          i !== maximumAttemptsToGetResultingUrl - 1 &&
          error instanceof Error &&
          error.message === 'page.evaluate: Execution context was destroyed, most likely because of a navigation'
        ) {
          // Some websites do frontend redirection through JavaScript or `<meta http-equiv="refresh" content="0;URL=https:/xxxxx"></html>`
          // And it's impossible to properly handle this case with `await page.waitForNavigation()` because if no redirection it will hang.
          // The workaround is to wait for this specific error to deduce the page is changing, to wait a bit more and retry (throw this error if the retry attempts did not solved the issue)
          await page.waitForTimeout(2000);
        } else {
          throw error;
        }
      }
    }

    const resultingUrl = new URL(resultingRawUrl);
    if (resultingUrl.host !== originalUrl.host) {
      throw new BusinessDomainError(unexpectedDomainRedirectionError, resultingUrl.hostname);
    }

    const html: string = await page.content();
    const title = await page.title();
    const status = response.status();
    const headers = response.headers();

    return {
      status: status,
      html: html,
      title: title !== '' ? title : null,
      headers: headers,
      redirectTargetUrl: originalUrl.toString() !== resultingUrl.toString() ? resultingUrl : null,
    };
  } finally {
    await page.close();
  }
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

  // Since common pattern could be just about common words (articles, pronouns...) we make sure to filter this case
  // Note: the tokenizer is smart enough to split attached words like in "de l'autoroute", it would return: `de, l, autoroute`
  const tokenizer = new WordTokenizer();
  const words = tokenizer.tokenize(commonTitle);

  if (!words) {
    // Low probability but why not
    return null;
  }

  const meaningfulWords = words.filter((word) => {
    const lowercasedWord = word.toLowerCase(); // Because the comparaison is done on lowercased ones

    // Filter words not meaningful (`de, la, du, des...`)
    return frenchStopwords.indexOf(lowercasedWord) === -1 && englishStopwords.indexOf(lowercasedWord) === -1;
  });

  if (meaningfulWords.length === 0) {
    return null;
  }

  // We do not expect the title to have a minimal length since some may have just 1 or 2
  // Note: we do not strip not meaningful words because they can be part of the name
  return commonTitle !== '' ? commonTitle : null;
}
