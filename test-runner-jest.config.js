const { getJestConfig } = require('@storybook/test-runner');

const defaultConfig = getJestConfig();

let headless = true;
process.argv.forEach(function (val, index, array) {
  if (val === '--no-headless') {
    headless = false;
  }
});

const config = {
  ...defaultConfig,
  testTimeout: 15 * 1000,
  setupFilesAfterEnv: [...defaultConfig.setupFilesAfterEnv, '<rootDir>/test-runner-jest-setup.js'],
  testEnvironmentOptions: {
    'jest-playwright': {
      ...defaultConfig['jest-playwright'],
      launchOptions: {
        headless: headless,
      },
    },
  },
};

// `test:e2e:storybook:command` is nested through several npm scripts, so we can't easily forward a
// `--max-workers` CLI flag from the CI step. Jest doesn't expose an env var for it either
// (https://jestjs.io/docs/environment-variables), so we plug `JEST_MAX_WORKERS` ourselves.
// Note: setting the key to `undefined` would still be picked up by Jest, hence the conditional.
if (typeof process.env.JEST_MAX_WORKERS === 'string') {
  config.maxWorkers = parseInt(process.env.JEST_MAX_WORKERS, 10);
}

module.exports = config;
