const CopyWebpackPlugin = require('copy-webpack-plugin');
const FileManagerPlugin = require('filemanager-webpack-plugin');
const path = require('path');
const TsconfigPathsPlugin = require('tsconfig-paths-webpack-plugin');

const staticBuildFolderPath = path.resolve(__dirname, '../storybook-static/');

module.exports = {
  stories: [path.resolve(__dirname, '../src/**/*.stories.@(js|ts|jsx|tsx|mdx)')],
  staticDirs: ['../public'],
  addons: [
    '@storybook/addon-a11y',
    '@storybook/addon-coverage',
    '@storybook/addon-designs',
    '@storybook/addon-essentials',
    '@storybook/addon-interactions',
    '@storybook/addon-links',
    '@storybook/addon-measure',
    '@storybook/addon-viewport',
    'storybook-addon-pseudo-states',
    'storybook-dark-mode',
  ],
  features: {
    buildStoriesJson: true,
  },
  framework: {
    name: '@storybook/nextjs',
    options: {
      // https://github.com/storybookjs/storybook/tree/next/code/frameworks/nextjs
      nextConfigPath: path.resolve(__dirname, '../next.config.js'),
    },
  },
  core: {
    enableCrashReports: false,
    disableTelemetry: true,
    builder: {
      name: 'webpack5',
      options: {
        fsCache: true,
        // lazyCompilation: true, // It's too slow for now
      },
    },
  },
  env: (config) => ({
    ...config,
    ENABLE_MOCKS: 'true',
    STORYBOOK_ENVIRONMENT: 'true',
    TRPC_SERVER_MOCK: 'true',
  }),
  async webpackFinal(config, { configType }) {
    // When building Storybook from scratch assets are copied into the `outputDir` before `CopyWebpackPlugin` builds the `/public/` folder
    // resulting in missing assets... so we have to make sure to copy a new time with all files
    // Ref: https://github.com/chromaui/chromatic-cli/issues/722
    // Note: it requires us to use `FileManagerPlugin` to make it working, `CopyWebpackPlugin` didn't work to copy after others even with priority
    let buildMode = false;
    let outputDir = staticBuildFolderPath;
    for (const [argIndex, argValue] of process.argv.entries()) {
      if (argValue.includes('storybook') && process.argv[argIndex + 1] === 'build') {
        buildMode = true;
      } else if (buildMode && argValue === '--output-dir') {
        outputDir = process.argv[argIndex + 1];

        break;
      }
    }

    if (buildMode) {
      config.plugins.push(
        new FileManagerPlugin({
          events: {
            onEnd: {
              copy: [
                {
                  source: path.resolve(__dirname, '../public/'),
                  destination: path.resolve(outputDir),
                },
              ],
            },
          },
        })
      );
    }

    // Expose all DSFR fonts as static at the root so emails and PDFs can download them when needed
    // And also static files embedded in the application
    config.plugins.push(
      new CopyWebpackPlugin({
        patterns: [
          {
            from: path.dirname(require.resolve('@gouvfr/dsfr/dist/fonts/Marianne-Bold.woff2')),
            to: path.resolve(__dirname, '../public/assets/fonts/'),
          },
          {
            from: require.resolve('@etabli/src/assets/fonts/index.css'),
            to: path.resolve(__dirname, '../public/assets/fonts/'),
          },
        ],
      })
    );

    config.module.rules.push({
      test: /\.(txt|html)$/i,
      use: 'raw-loader',
    });

    if (!config.resolve) {
      config.resolve = {};
    }

    if (!config.resolve.alias) {
      config.resolve.alias = {};
    }

    // [IMPORTANT] We wanted to use the node version for `main` and the browser for `docs` but we had issues using just an alias with default name as origin
    // so we changed to a `xxx-proxy` but then the `TypeScript is unable to find the module with right `paths` settings in `tsconfig.json`
    // so definitely giving up the optimization and using the ESM browser also for the node version
    // // Needed to make the CSV node library working in the browser
    // // We tried to do `csv-parse --> csv-parse/browser/esm` but it does not work, maybe because it's the same prefix... so we use a suffix `-proxy`
    // config.resolve.alias['csv-parse-proxy'] = 'csv-parse/browser/esm';
    // config.resolve.alias['csv-stringify-proxy'] = 'csv-stringify/browser/esm';

    config.resolve.plugins = [
      new TsconfigPathsPlugin({
        configFile: path.resolve(__dirname, '../tsconfig.json'),
      }),
    ];

    return config;
  },
  docs: {
    docsPage: true,
    autodocs: true,
  },
};
