import { NextRequest, NextResponse } from 'next/server';

const scriptSrcValues = ["'self'"];
const connectSrcValues = ["'self'"];
const fontSrcValues = ["'self'", 'https:', 'data:'];
const imgSrcValues = ["'self'", 'data:'];
const styleSrcValues = ["'self'", 'https:'];

// Make sure no `http` url are used
// Note: we scoped this to production some browsers enable it by default, which causes issues with `http://localhost:3000` upgrading links, breaking scripts and tags
const upgradeInsecureRequests = process.env.NODE_ENV === 'production';

// Crisp settings
{
  scriptSrcValues.push('https://client.crisp.chat/');
  connectSrcValues.push('wss://client.relay.crisp.chat/', 'https://client.crisp.chat/static/', 'https://storage.crisp.chat/users/upload/');
  styleSrcValues.push('https://client.crisp.chat/');
  imgSrcValues.push('https://*.crisp.chat/');
  fontSrcValues.push('https://client.crisp.chat/static/');
}

// Matomo settings
if (process.env.NEXT_PUBLIC_MATOMO_URL) {
  scriptSrcValues.push(process.env.NEXT_PUBLIC_MATOMO_URL);
  connectSrcValues.push(process.env.NEXT_PUBLIC_MATOMO_URL);
}

// Sentry settings
if (process.env.NEXT_PUBLIC_SENTRY_DSN) {
  const sentryDsn = new URL(process.env.NEXT_PUBLIC_SENTRY_DSN);
  const inferedSentryUrl = `${sentryDsn.protocol}//${sentryDsn.host}/`;

  connectSrcValues.push(inferedSentryUrl);
}

if (process.env.NODE_ENV === 'development') {
  // Due to Next.js hot reload in development we need to allow `eval()`
  // Ref: https://github.com/vercel/next.js/issues/14221
  scriptSrcValues.push("'unsafe-eval'");
}

// Those headers are directly inspired from the default of https://github.com/helmetjs/helmet
// (they don't have a Next.js integration so dealing with it manually)
function formatSecurityHeaders(nonce?: string) {
  // MUI and rrweb requires inline style to work normally, so we allow it for `style-src-attr` (not for `style-src`)
  // The attack vector is too tiny, so this workaround is acceptable to us (see an advice on https://security.stackexchange.com/questions/239639/what-do-i-risk-if-i-use-csp-header-style-src-attr-unsafe-hashes-hash)
  // Note: at the end we use it also for some of our components (search for `style=`) to avoid complexifying too much our logic
  // Refs:
  // - https://github.com/rrweb-io/rrweb/issues/816#issuecomment-1988622435
  // - https://github.com/mui/material-ui/issues/19938#issuecomment-1989042978
  const libraryCompatibilityWorkaround = true;

  // Note: we could have used trusted types to prevent client-side injections but it fails locally. So for now, disabling it since we didn't find an easy way
  // For record, we used initially: `require-trusted-types-for 'script'; trusted-types react-dsfr react-dsfr-asap nextjs#bundler matomo-next; ${restOfPoliciesAsBelow}`
  //
  // Also we wanted to use the nonce for styles by using `style-src-elem ${`'nonce-${nonce}'`} ${styleSrcValues.join(' ')};` but at the end
  // Crisp is loading `l.js` (we modified it for test with `patch-package`) to propagate the nonce, but then this script is downloading `client.js`
  // that is trying to manipulate inline style, which was triggering an error despite the nonce should be propagated... so
  // we gave up on style restrictions by using the unsafe setting: `style-src-elem 'unsafe-inline' ${styleSrcValues.join(' ')};`
  // Ref: https://github.com/crisp-im/crisp-sdk-web/issues/31
  return {
    'Content-Security-Policy': `default-src 'self';base-uri 'self';font-src ${fontSrcValues.join(
      ' '
    )};form-action 'self';frame-ancestors 'self';img-src ${imgSrcValues.join(
      ' '
    )};object-src 'none';script-src ${`'nonce-${nonce}'`} ${scriptSrcValues.join(' ')};script-src-attr 'none';connect-src ${connectSrcValues.join(
      ' '
    )};style-src-elem 'unsafe-inline' ${styleSrcValues.join(' ')};style-src-attr 'self' ${libraryCompatibilityWorkaround ? "'unsafe-inline'" : ''}${
      upgradeInsecureRequests ? ';upgrade-insecure-requests' : ''
    }`,
    'Origin-Agent-Cluster': '?1',
    'Referrer-Policy': 'no-referrer',
    'Strict-Transport-Security': 'max-age=15552000; includeSubDomains',
    'X-Content-Type-Options': 'nosniff',
    'X-DNS-Prefetch-Control': 'off',
    'X-Download-Options': 'noopen',
    'X-Frame-Options': 'SAMEORIGIN',
    'X-Permitted-Cross-Domain-Policies': 'none',
    'X-XSS-Protection': '0',
  };
}

export function mergeHeadersForNextjs(headersToAdjust: Headers, headersToAdd: { [key: string]: string }) {
  Object.keys(headersToAdd).forEach((headerName) => {
    headersToAdjust.set(headerName, headersToAdd[headerName]);
  });
}

export function middleware(request: NextRequest) {
  const nonce = Buffer.from(crypto.randomUUID()).toString('base64');

  const requestHeaders = new Headers(request.headers);
  const response = NextResponse.next({
    request: {
      headers: requestHeaders,
    },
  });

  // Wanted to use `same-origin` for CORS but it blocks downloading `/assets/*` like styles and images from an email viewer
  // So having a specific condition to set appropriate header
  // TODO: we could reduce a bit headers on resources and assets as specified below but `export const config` is failing (see comment)
  const url = new URL(request.url);
  if (url.pathname.startsWith('/assets/')) {
    mergeHeadersForNextjs(response.headers, {
      ...formatSecurityHeaders(),
      'Cross-Origin-Resource-Policy': 'cross-origin', // Wanted to use `same-origin` but it blocks downloading `/assets/*` like styles and images from an email viewer
      'Access-Control-Allow-Origin': '*', // Needed to load font files from an email viewer
    });
  } else {
    mergeHeadersForNextjs(response.headers, {
      ...formatSecurityHeaders(nonce),
      'X-Nonce': nonce, // Needed to load external script that cannot specify custom response headers for CORS/CORP/COEP
    });
  }

  return response;
}

// // According to the Next.js documentation the following should avoid making extra processing to put headers on static assets
// // but when applied the middleware is no longer working, so leaving it commented for now
//
// export const config = {
//   matcher: [
//     /*
//      * Match all request paths except for the ones starting with:
//      * - api (API routes)
//      * - _next/static (static files)
//      * - _next/image (image optimization files)
//      * - favicon.ico (favicon file)
//      */
//     {
//       source: '/((?!api|_next/static|_next/image|favicon.ico).*)',
//       missing: [
//         { type: 'header', key: 'next-router-prefetch' },
//         { type: 'header', key: 'purpose', value: 'prefetch' },
//       ],
//     },
//   ],
// };
