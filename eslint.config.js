const next = require('eslint-config-next');
const prettier = require('eslint-config-prettier');
const jsxA11y = require('eslint-plugin-jsx-a11y');
const mdx = require('eslint-plugin-mdx');
const storybook = require('eslint-plugin-storybook');
const testingLibrary = require('eslint-plugin-testing-library');

module.exports = [
  {
    ignores: ['build/**', 'data/**', 'dist/**', 'storybook-static/**', 'src/generated/**', '.next/**', 'public/mockServiceWorker.js'],
  },
  ...next,
  ...storybook.configs['flat/recommended'],
  {
    files: ['**/*.{js,jsx,ts,tsx}'],
    rules: jsxA11y.flatConfigs.strict.rules,
  },
  {
    rules: {
      ...prettier.rules,
      '@next/next/no-html-link-for-pages': 'off',
      'interface-name': 'off',
      'no-console': 'off',
      'no-implicit-dependencies': 'off',
      'no-submodule-imports': 'off',
      'no-trailing-spaces': 'error',
      'react/jsx-key': 'off',
      // New rules of the React Compiler era, not adopted yet
      'react-hooks/immutability': 'off',
      'react-hooks/incompatible-library': 'off',
      'react-hooks/purity': 'off',
      'react-hooks/refs': 'off',
      'react-hooks/set-state-in-effect': 'off',
      'react-hooks/static-components': 'off',
      'react-hooks/use-memo': 'off',
      'react-hooks/preserve-manual-memoization': 'off',
      'storybook/no-uninstalled-addons': 'off',
      // When hunting dead code it's useful to use the following:
      // ---
      // 'no-unused-vars': 'error',
      // 'import/no-unused-modules': [1, { unusedExports: true }],
    },
  },
  mdx.configs.flat,
  {
    files: ['**/*.md', '**/*.mdx'],
    languageOptions: {
      parserOptions: {
        // The version needs to be "fixed" due to linting errors otherwise (ref: https://github.com/mdx-js/eslint-mdx/issues/366#issuecomment-1361898854)
        ecmaVersion: 12,
      },
    },
    rules: {
      // Inside .mdx files it always throws this rule when there is a title tag, no matter what, so skipping
      'jsx-a11y/heading-has-content': 'off',
    },
  },
  // Only uses Testing Library lint rules in test files
  {
    files: ['**/__tests__/**/*.[jt]s?(x)', '**/?(*.)+(spec|test).[jt]s?(x)'],
    ...testingLibrary.configs['flat/react'],
  },
];
