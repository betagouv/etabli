const path = require('path');

const { commonPackages } = require('./transpilePackages');

const { withSentryConfig } = require('@sentry/nextjs/config');
const CopyWebpackPlugin = require('copy-webpack-plugin');
const gitRevision = require('git-rev-sync');
const { getCommitSha, getHumanVersion, getTechnicalVersion } = require('./src/utils/app-version.js');

const mode = process.env.APP_MODE || 'test';

// TODO: once Next supports `next.config.js` we can set types like `ServerRuntimeConfig` and `PublicRuntimeConfig` below
const moduleExports = async () => {
  const appHumanVersion = await getHumanVersion();

  /**
   * @type {import('next').NextConfig}
   */
  let standardModuleExports = {
    reactStrictMode: true,
    output: process.env.NEXTJS_BUILD_OUTPUT_MODE || 'standalone', // To debug locally the `next start` comment this line (it will avoid trying to mess with the assembling folders logic of standalone mode)
    env: {
      // Those will replace `process.env.*` with hardcoded values (useful when the value is calculated during the build time)
      SENTRY_RELEASE_TAG: appHumanVersion,
    },
    typescript: {
      ignoreBuildErrors: true, // Skip since already done in a specific step of our CI/CD
    },
    transpilePackages: commonPackages,
    outputFileTracingIncludes: {
      '*': ['./src/prisma/migrations/**/*', './src/prisma/schema.prisma', './prisma.config.ts', './start-and-wait-to-init.sh'],
    },
    outputFileTracingExcludes: {
      // Local data (database dumps, datasets, downloaded lists...) must never be embedded into the build. A global `./data/**/*` cannot be used
      // since Next.js also applies it to paths containing `.../metadata/` and removes some of its own files (ref: https://github.com/vercel/next.js/issues/62331)
      '*': [
        // Only distinctive names: a pattern like `./data/*.json` also removed `node_modules/psl/data/rules.json`
        './data/*.db',
        './data/*.dump',
        './data/etabli-import-*.sql',
        './data/datasets/**/*',
        './data/initiatives/**/*',
        './data/wappalyzer/**/*',
        './data/codegouv-repository-organizations.yaml',
        './data/repository-organizations.yaml',
        './data/dila-organizations.json',
        './data/organizations.json',
        './data/education-establishments.json',
        './data/repositories*.json',
        './data/dpnt-quotidien.json.gz',
        './data/ip2asn-v4.tsv.gz',
        './data/domains*.csv',
        './data/tools.csv',
        './data/graph.json',
        './scripts/**/*',
      ], // Note that folders starting with a dot are already ignored after verification
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
        {
          source: '/dataset/initiatives.:filetype',
          destination: '/api/dataset/initiatives?filetype=:filetype',
        },
      ];
    },
    async redirects() {
      return [
        {
          source: '/explore', // The standalone `/explore` page was replaced by an in-app modal
          destination: '/',
          permanent: true,
        },
      ];
    },
    images: {
      // Images are served as they are, without the on-the-fly optimization done by `sharp` on the `/_next/image` route (it then returns 404).
      // The optimizer is where most of the critical vulnerabilities of Next.js v14 are (remote code execution with SVG and AVIF files,
      // denial of service through `remotePatterns`, unbounded cache) and they are not patched for this major version. Its native memory is
      // also not covered by our Node.js heap cap. Static images must be compressed before being committed
      unoptimized: true,
    },
    // Turbopack (the default bundler since Next.js 16) ignores this function, so `next dev` and `next build` are given `--webpack` in `package.json`
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
    poweredByHeader: false,
    generateBuildId: async () => {
      return await getTechnicalVersion();
    },
  };

  const uploadToSentry = process.env.SENTRY_RELEASE_UPLOAD === 'true' && process.env.NODE_ENV === 'production';

  const sentryBuildOptions = {
    webpack: {
      unstable_sentryWebpackPluginOptions: {
        disable: !uploadToSentry,
      },
      treeshake: {
        removeDebugLogging: false,
      },
    },
    debug: false,
    silent: false,
    release: {
      name: appHumanVersion,
      setCommits: {
        // TODO: get error: caused by: sentry reported an error: You do not have permission to perform this action. (http status: 403)
        // Possible ref: https://github.com/getsentry/sentry-cli/issues/1388#issuecomment-1306137835
        // Note: not able to bind our repository to our on-premise Sentry as specified in the article... leaving it manual for now (no commit details...)
        auto: false,
        repo: 'betagouv/etabli',
        commit: getCommitSha(),
      },
      deploy: {
        env: mode,
      },
    },
    widenClientFileUpload: false,
    // tunnelRoute: '/monitoring', // Helpful to avoid adblockers, but requires Sentry SaaS
    sourcemaps: {
      disable: process.env.NODE_ENV === 'development',
      deleteSourcemapsAfterUpload: mode === 'prod', // do not serve sourcemaps in `prod` (replaces the former `hideSourceMaps`)
    },
  };

  return withSentryConfig(standardModuleExports, sentryBuildOptions);
};

module.exports = moduleExports;
