import * as Sentry from '@sentry/nextjs';
import { errors as playwrightErrors } from 'playwright';

// This should be used close to network calls because it silents errors
// And in our case of long-running jobs we want the loop to continue despite network errors because it will be fetch again next time
// TODO: in the future we could register the error into the database for specific domains so we can tell to the list source to look at removing them if appropriate
export function handleReachabilityError(error: Error) {
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
      // Invalid certificate
      'ERR_SSL_TLSV1_ALERT_INTERNAL_ERROR',
      'ERR_TLS_CERT_ALTNAME_INVALID', // Hostname/IP does not match certificate's altnames (which makes the certificate invalid)
      'DEPTH_ZERO_SELF_SIGNED_CERT',
      'UNABLE_TO_VERIFY_LEAF_SIGNATURE',
      'CERT_HAS_EXPIRED',
      'SELF_SIGNED_CERT_IN_CHAIN',
    ].includes((error.cause as any)?.code || '') &&
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
  }
}
