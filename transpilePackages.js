module.exports = {
  commonPackages: ['@codegouvfr/react-dsfr', '@mui/x-data-grid', '@mui/x-date-pickers', 'tss-react'],
  additionalJestPackages: [
    // ESM-only packages (and their ESM-only dependencies) used by unit-tested code
    'parse-domain',
    'is-ip',
    'ip-regex',
    'super-regex',
    'clone-regexp',
    'is-regexp',
    'function-timeout',
    'time-span',
    'convert-hrtime',
  ],
  formatTransformIgnorePatterns(packagesToTranspile, previousPatterns) {
    // Inspired from `next.js/packages/next/src/build/jest/jest.ts`

    const transpiled = (packagesToTranspile ?? []).join('|');

    return [
      // To match Next.js behavior node_modules is not transformed, only `transpiledPackages`
      ...(transpiled
        ? [`/node_modules/(?!.pnpm)(?!(${transpiled})/)`, `/node_modules/.pnpm/(?!(${transpiled.replace(/\//g, '\\+')})@)`]
        : ['/node_modules/']),
      // CSS modules are mocked so they don't need to be transformed
      '^.+\\.module\\.(css|sass|scss)$',

      // Custom config can append to transformIgnorePatterns but not modify it
      // This is to ensure `node_modules` and .module.css/sass/scss are always excluded
      ...(previousPatterns || []),
    ];
  },
};
