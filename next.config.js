const path = require('path');
const tsImport = require('ts-import');

const { commonPackages } = require('./transpilePackages');

const tsImportLoadOptions = {
  mode: tsImport.LoadMode.Compile,
  compilerOptions: {
    paths: {
      // [IMPORTANT] Paths are not working, we modified inside files to use relative ones where needed
      '@etabli/*': ['./*'],
    },
  },
};

const { getBaseUrl } = tsImport.loadSync(path.resolve(__dirname, `./src/utils/url.ts`), tsImportLoadOptions);

const { withSentryConfig } = require('@sentry/nextjs');
const CopyWebpackPlugin = require('copy-webpack-plugin');
const gitRevision = require('git-rev-sync');
const { getCommitSha, getHumanVersion, getTechnicalVersion } = require('./src/utils/app-version.js');
const { i18n } = require('./next-i18next.config');

const mode = process.env.APP_MODE || 'test';

const baseUrl = new URL(getBaseUrl());

// TODO: once Next supports `next.config.js` we can set types like `ServerRuntimeConfig` and `PublicRuntimeConfig` below
const moduleExports = async () => {
  const appHumanVersion = await getHumanVersion();

  /**
   * @type {import('next').NextConfig}
   */
  let standardModuleExports = {
    reactStrictMode: true,
    swcMinify: true,
    output: process.env.NEXTJS_BUILD_OUTPUT_MODE || 'standalone', // To debug locally the `next start` comment this line (it will avoid trying to mess with the assembling folders logic of standalone mode)
    env: {
      // Those will replace `process.env.*` with hardcoded values (useful when the value is calculated during the build time)
      SENTRY_RELEASE_TAG: appHumanVersion,
    },
    serverRuntimeConfig: {},
    publicRuntimeConfig: {
      appMode: mode,
      appVersion: appHumanVersion,
    },
    i18n: i18n,
    eslint: {
      ignoreDuringBuilds: true, // Skip since already done in a specific step of our CI/CD
    },
    typescript: {
      ignoreBuildErrors: true, // Skip since already done in a specific step of our CI/CD
    },
    transpilePackages: commonPackages,
    experimental: {
      outputFileTracingIncludes: {
        '*': ['./src/prisma/migrations/**/*', './src/prisma/schema.prisma', './start-and-wait-to-init.sh'], // Migration and start files are required when doing automatic migration before starting the application
      },
      // It should have been the new `outputFileTracingExcludes` property but it's messing with the Next.js core (ref: https://github.com/vercel/next.js/issues/62331)
      outputFileTracingExcludes: {
        '*': [
          // // The global exclusion of `data` should have worked but it's not so listing one by one (ref: https://github.com/vercel/next.js/issues/62331)
          // './data/**/*'
          './data/initiatives/**/*',
          './data/domains.csv',
          './data/graph.json',
          './data/repositories.json',
          './data/tools.csv',
          './scripts/**/*',
        ], // Note that folders starting with a dot are already ignored after verification
      },
      swcPlugins: [['next-superjson-plugin', { excluded: [] }]],
    },
    async rewrites() {
      return [
        {
          source: '/.well-known/security.txt',
          destination: '/api/security',
        },
        {
          source: '/robots.txt',
          destination: '/api/robots',
        },
        {
          source: '/sitemap/:reference.xml',
          destination: '/api/sitemap/:reference',
        },
      ];
    },
    images: {
      remotePatterns: [
        {
          protocol: baseUrl.protocol.slice(0, -1),
          hostname: baseUrl.hostname,
        },
        {
          protocol: 'https',
          hostname: 'via.placeholder.com',
        },
      ],
    },
    webpack: (config, { buildId, dev, isServer, defaultLoaders, nextRuntime, webpack }) => {
      // Expose all DSFR fonts as static at the root
      config.plugins.push(
        new CopyWebpackPlugin({
          patterns: [
            {
              from: path.dirname(require.resolve('@gouvfr/dsfr/dist/fonts/Marianne-Bold.woff2')),
              to: path.resolve(__dirname, './public/assets/fonts/'),
            },
            {
              from: require.resolve('./src/assets/fonts/index.css'),
              to: path.resolve(__dirname, './public/assets/fonts/'),
            },
          ],
        })
      );

      config.module.rules.push({
        test: /\.woff2$/,
        type: 'asset/resource',
      });

      config.module.rules.push({
        test: /\.(txt|html)$/i,
        use: 'raw-loader',
      });

      return config;
    },
    sentry: {
      hideSourceMaps: mode === 'prod', // Do not serve sourcemaps in `prod`
      // disableServerWebpackPlugin: true, // TODO
      // disableClientWebpackPlugin: true, // TODO
    },
    poweredByHeader: false,
    generateBuildId: async () => {
      return await getTechnicalVersion();
    },
  };

  const uploadToSentry = process.env.SENTRY_RELEASE_UPLOAD === 'true' && process.env.NODE_ENV === 'production';

  const sentryWebpackPluginOptions = {
    dryRun: !uploadToSentry,
    debug: false,
    silent: false,
    release: appHumanVersion,
    setCommits: {
      // TODO: get error: caused by: sentry reported an error: You do not have permission to perform this action. (http status: 403)
      // Possible ref: https://github.com/getsentry/sentry-cli/issues/1388#issuecomment-1306137835
      // Note: not able to bind our repository to our on-premise Sentry as specified in the article... leaving it manual for now (no commit details...)
      auto: false,
      commit: getCommitSha(),
      // auto: true,
    },
    deploy: {
      env: mode,
    },
  };

  return withSentryConfig(standardModuleExports, sentryWebpackPluginOptions, {
    transpileClientSDK: true,
    // tunnelRoute: '/monitoring', // Helpful to avoid adblockers, but requires Sentry SaaS
    hideSourceMaps: false,
    disableLogger: false,
  });
};

module.exports = moduleExports;
