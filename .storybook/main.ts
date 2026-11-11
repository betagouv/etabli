import type { StorybookConfig } from '@storybook/nextjs';
import CopyWebpackPlugin from 'copy-webpack-plugin';
import FileManagerPlugin from 'filemanager-webpack-plugin';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'path';
import TsconfigPathsPlugin from 'tsconfig-paths-webpack-plugin';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const require = createRequire(import.meta.url);
const staticBuildFolderPath = path.resolve(__dirname, '../storybook-static/');

const config: StorybookConfig = {
  stories: [path.resolve(__dirname, '../src/**/*.stories.@(js|ts|jsx|tsx|mdx)')],
  staticDirs: ['../public'],
  addons: [
    '@storybook/addon-a11y',
    '@storybook/addon-coverage',
    '@storybook/addon-designs',
    '@storybook/addon-docs',
    '@storybook/addon-links',
    'storybook-addon-pseudo-states',
    '@vueless/storybook-dark-mode',
    '@chromatic-com/storybook',
    'msw-storybook-addon',
  ],
  framework: {
    name: '@storybook/nextjs',
    options: {
      // https://github.com/storybookjs/storybook/tree/next/code/frameworks/nextjs
      nextConfigPath: path.resolve(__dirname, '../next.config.js'),
      builder: {
        fsCache: true,
      },
    },
  },
  core: {
    enableCrashReports: false,
    disableTelemetry: true,
  },
  env: (config) => ({
    ...config,
    ENABLE_MOCKS: 'true',
    STORYBOOK_ENVIRONMENT: 'true',
    TRPC_SERVER_MOCK: 'true',
  }),
  async webpackFinal(config) {
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
      config.plugins!.push(
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
    config.plugins!.push(
      new CopyWebpackPlugin({
        patterns: [
          {
            from: path.dirname(require.resolve('@gouvfr/dsfr/dist/fonts/Marianne-Bold.woff2')),
            to: path.resolve(__dirname, '../public/assets/fonts/'),
          },
          {
            from: path.resolve(__dirname, '../src/assets/fonts/index.css'),
            to: path.resolve(__dirname, '../public/assets/fonts/'),
          },
        ],
      })
    );

    config.module!.rules!.push({
      test: /\.(txt|html)$/i,
      use: 'raw-loader',
    });

    if (!config.resolve) {
      config.resolve = {};
    }

    if (!config.resolve.alias) {
      config.resolve.alias = {};
    }

    config.resolve.plugins = [
      new TsconfigPathsPlugin({
        configFile: path.resolve(__dirname, '../tsconfig.json'),
      }),
    ];

    return config;
  },
  docs: {},
};

export default config;
