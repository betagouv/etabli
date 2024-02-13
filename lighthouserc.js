module.exports = {
  ci: {
    collect: {
      numberOfRuns: 1,
      settings: {
        chromeFlags: ['--ignore-certificate-errors', '--disable-gpu', '--no-sandbox'],
        extraHeaders: JSON.stringify({ Authentication: 'TODO_SET_TEST_TOKEN_BUT_MAYBE_IT_NEEDS_SERVER_RUN_NOT_EXPORT' }),
      },
    },
    assert: {
      preset: 'lighthouse:recommended',
      // TODO: maybe use the preset "no-pwa" since SSR
      // TODO: fix those in the future, we were just missing layouts to manage them
      assertions: {
        'apple-touch-icon': 'off',
        'csp-xss': 'off',
        'html-has-lang': 'off',
        'installable-manifest': 'off',
        'maskable-icon': 'off',
        'meta-description': 'off',
        'service-worker': 'off',
        'splash-screen': 'off',
        'themed-omnibox': 'off',
        'document-title': 'off',
        'errors-in-console': 'off',
        'unused-javascript': 'off',
      },
    },
  },
};
