// When it's an error related to the remote server or the connection we skip it since we have no control over it
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
    ].includes((error.cause as any)?.code || '')
  ) {
    throw error;
  }
}
