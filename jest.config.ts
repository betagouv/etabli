import dotenv from 'dotenv';
import { getTsconfig } from 'get-tsconfig';
import nextJest from 'next/jest';
import path from 'path';
import { pathsToModuleNameMapper } from 'ts-jest';

import { additionalJestPackages, commonPackages, formatTransformIgnorePatterns } from './transpilePackages';

const createJestConfig = nextJest({
  dir: './',
});

const fullTsconfig = getTsconfig();
if (!fullTsconfig) {
  throw new Error(`a "tsconfig.json" must be provided`);
}

// Load test variables if any
dotenv.config({ path: path.resolve(__dirname, './.env.jest') });
dotenv.config({ path: path.resolve(__dirname, './.env.jest.local') });

// Add any custom config to be passed to Jest
const customJestConfig: Parameters<typeof createJestConfig>[0] = {
  preset: 'ts-jest',
  setupFilesAfterEnv: [],
  moduleDirectories: ['node_modules', '<rootDir>/'],
  moduleNameMapper: {
    ...(fullTsconfig.config.compilerOptions && fullTsconfig.config.compilerOptions.paths
      ? pathsToModuleNameMapper(fullTsconfig.config.compilerOptions.paths, { prefix: '<rootDir>/' })
      : {}),
  },
  testEnvironment: 'jest-environment-jsdom',
  testPathIgnorePatterns: ['<rootDir>/.next/', '<rootDir>/node_modules/'],
  transformIgnorePatterns: [],
  transform: {
    '\\.[jt]sx?$': [
      'ts-jest',
      {
        tsconfig: {
          jsx: 'react',
        },
      },
    ],
  },
};

// [WORKAROUND] To transpile additional dependencies we hack a bit as specified into https://github.com/vercel/next.js/discussions/31152#discussioncomment-1697047
// (and we add our own logic to avoid hardcoding values)
const asyncConfig = createJestConfig(customJestConfig);

const defaultExport = async () => {
  const config = await asyncConfig();

  config.transformIgnorePatterns = formatTransformIgnorePatterns(
    [...commonPackages, ...additionalJestPackages],
    customJestConfig.transformIgnorePatterns ?? []
  );

  return config;
};

export default defaultExport;
