import * as Sentry from '@sentry/nextjs';

// This should be used close to network calls because it silents errors
// And in our case of long-running jobs we want the loop to continue despite network errors because it will be fetch again next time
// TODO: in the future we could register the error into the database for specific domains so we can tell to the list source to look at removing them if appropriate
export function handleReachabilityError(error: Error) {
  if (
    ![
      // The server is unreachable, since the route may be broken temporarily we skip the domain to be reprocessed next time
      'ECONNREFUSED',
      'ECONNRESET',
      'ENETUNREACH',
      'ENOTFOUND',
      'UND_ERR_SOCKET',
      'UND_ERR_CONNECT_TIMEOUT',
      // Some websites return wrongly formatted headers (like https://mesads.beta.gouv.fr/robots.txt due to the provider Clever Cloud)
      // Which makes `fetch()` failing with `HPE_INVALID_HEADER_TOKEN ... Invalid header value char`.
      'HPE_INVALID_HEADER_TOKEN',
      // Hostname/IP does not match certificate's altnames (which makes the certificate invalid)
      'ERR_TLS_CERT_ALTNAME_INVALID',
      'DEPTH_ZERO_SELF_SIGNED_CERT',
      'UNABLE_TO_VERIFY_LEAF_SIGNATURE',
      'CERT_HAS_EXPIRED',
    ].includes((error.cause as any)?.code || '')
  ) {
    // Since we do not throw error, we log them for record but we also notify Sentry so we can make the list above updated with appropriate codes
    console.error(error);

    Sentry.captureException(error);
  }
}
