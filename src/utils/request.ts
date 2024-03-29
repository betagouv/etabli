import { RawDomain } from '@prisma/client';
import { PrismaClientUnknownRequestError } from '@prisma/client/runtime/library';
import * as Sentry from '@sentry/nextjs';
import assert from 'assert';
import { errors as playwrightErrors } from 'playwright';

import { prisma } from '@etabli/src/prisma';

export const chomiumMaxConcurrency = !!process.env.CHROMIUM_MAXIMUM_CONCURRENCY ? parseInt(process.env.CHROMIUM_MAXIMUM_CONCURRENCY, 10) : 1;
assert(chomiumMaxConcurrency >= 1);

export const llmManagerMaximumApiRequestsPerSecond = !!process.env.LLM_MANAGER_MAXIMUM_API_REQUESTS_PER_SECOND
  ? parseInt(process.env.LLM_MANAGER_MAXIMUM_API_REQUESTS_PER_SECOND, 10)
  : 5; // 5 is the default when creating an account onto the MistralAI platform
assert(llmManagerMaximumApiRequestsPerSecond >= 1);

// This should be used close to network calls because it silents errors
// And in our case of long-running jobs we want the loop to continue despite network errors because it will be fetch again next time
// TODO: in the future we could register the error into the database for specific domains so we can tell to the list source to look at removing them if appropriate
export async function handleReachabilityError(rawDomain: Pick<RawDomain, 'id' | 'name'>, error: Error): Promise<void> {
  if (
    !(error instanceof playwrightErrors.TimeoutError) && // This error came from us forcing the Playwright timeout
    !(error.name === 'AbortError' && error.cause instanceof DOMException && error.cause.code === DOMException.TIMEOUT_ERR) && // This error came from us forcing the `https.request()` timeout
    !(error instanceof DOMException && error.code === DOMException.TIMEOUT_ERR) && // This error came from us forcing the `fetch()` timeout
    ![
      // The server is unreachable, since the route may be broken temporarily we skip the domain to be reprocessed next time
      'EAI_AGAIN',
      'ECONNREFUSED',
      'ECONNRESET',
      'EHOSTUNREACH',
      'ENETUNREACH',
      'ENOTFOUND',
      'ETIMEDOUT',
      'UND_ERR_CONNECT_TIMEOUT',
      'UND_ERR_HEADERS_TIMEOUT',
      'UND_ERR_SOCKET',
      // Some websites return wrongly formatted headers (like https://mesads.beta.gouv.fr/robots.txt due to the provider Clever Cloud)
      // Which makes `fetch()` failing with `HPE_INVALID_HEADER_TOKEN ... Invalid header value char`.
      'HPE_INVALID_HEADER_TOKEN',
      // Invalid certificate or secure connection
      'EPROTO',
      'ERR_SSL_TLSV1_ALERT_INTERNAL_ERROR',
      'ERR_TLS_CERT_ALTNAME_INVALID', // Hostname/IP does not match certificate's altnames (which makes the certificate invalid)
      'DEPTH_ZERO_SELF_SIGNED_CERT',
      'UNABLE_TO_VERIFY_LEAF_SIGNATURE',
      'CERT_HAS_EXPIRED',
      'SELF_SIGNED_CERT_IN_CHAIN',
      // Errors coming from Playwright
      'net::ERR_ABORTED',
      'net::ERR_ADDRESS_UNREACHABLE',
      'net::ERR_BLOCKED_BY_RESPONSE',
      'net::ERR_BLOCKED_BY_RESPONSE.NotSameOrigin',
      'net::ERR_CERT_AUTHORITY_INVALID',
      'net::ERR_CERT_COMMON_NAME_INVALID',
      'net::ERR_CERT_DATE_INVALID',
      'net::ERR_CONNECTION_CLOSED',
      'net::ERR_CONNECTION_REFUSED',
      'net::ERR_CONNECTION_RESET',
      'net::ERR_CONTENT_DECODING_FAILED',
      'net::ERR_FAILED',
      'net::ERR_FILE_NOT_FOUND',
      'net::ERR_HTTP2_PROTOCOL_ERROR',
      'net::ERR_NAME_NOT_RESOLVED',
      'net::ERR_SOCKET_NOT_CONNECTED',
      'net::ERR_SSL_PROTOCOL_ERROR',
      'net::ERR_UNKNOWN_URL_SCHEME',
    ].includes((error.cause as any)?.code || (error as any).code || '') &&
    !(
      error instanceof TypeError &&
      [
        'redirect count exceeded', // Having a 301 redirection on itself exemple example
      ].includes(error.message)
    )
  ) {
    // Since we do not throw error, we log them for record but we also notify Sentry so we can make the list above updated with appropriate codes
    console.error(error);

    Sentry.captureException(error);
  } else {
    console.error(`an error has occured while doing some network process for "${rawDomain.name}"`);
    console.error(error);
  }

  // Register the error timestamp to avoid reprocessing it too quickly
  await prisma.rawDomain.update({
    where: {
      id: rawDomain.id,
    },
    data: {
      lastUpdateAttemptWithReachabilityError: new Date(),
      lastUpdateAttemptReachabilityError: error.message,
    },
    select: {
      id: true, // Ref: https://github.com/prisma/prisma/issues/6252
    },
  });
}

export function handlePrismaErrorDueToContent(error: PrismaClientUnknownRequestError) {
  // If matching our rules skip the error since it's extremely rare and we are fine to skip non-compliant websites.
  if (error.message.includes('invalid byte sequence for encoding \\"UTF8\\": 0x00')) {
    // For whatever reason the website is having a null charater in its content which is unallowed by PostgreSQL for text fields (ref: https://stackoverflow.com/a/1348551/3608410)
  } else if (error.message.includes('is not a valid unicode code point')) {
    // It's a bit complex to understand why the encoding is failing
    // but it seems an incorrect UTF "surrogate pair" is present in the content so Prisma fails parsing it.
    //
    // In our case we had the exact error `d835 is not a valid unicode code point` which can be reproduced by updating a Prisma row with the text `Hello \ud835`
    //
    // Refs:
    // - https://stackoverflow.com/questions/54536539/unicodeencodeerror-utf-8-codec-cant-encode-character-ud83d-in-position-38/54549874#54549874
    // - https://github.com/prisma/prisma/issues/21578
  } else {
    // It seems to not be an error about third-party content we have no control on, so we should investigate it
    throw error;
  }
}
