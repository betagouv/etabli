module.exports = {
  root: true,
  extends: ['next', 'prettier', 'plugin:storybook/recommended', 'plugin:jsx-a11y/strict'],
  plugins: ['@typescript-eslint', 'import', 'jsx-a11y', 'testing-library'],
  ignorePatterns: ['build', 'data', 'dist', 'storybook-static'],
  rules: {
    '@next/next/no-html-link-for-pages': 'off',
    'interface-name': 'off',
    'no-console': 'off',
    'no-implicit-dependencies': 'off',
    'no-submodule-imports': 'off',
    'no-trailing-spaces': 'error',
    'react/jsx-key': 'off',
    // When hunting dead code it's useful to use the following:
    // ---
    // 'no-unused-vars': 'error',
    // 'import/no-unused-modules': [1, { unusedExports: true }],
  },
  overrides: [
    {
      files: ['*.md', '*.mdx'],
      extends: 'plugin:mdx/recommended',
      parserOptions: {
        // The version needs to be "fixed" due to linting errors otherwise (ref: https://github.com/mdx-js/eslint-mdx/issues/366#issuecomment-1361898854)
        ecmaVersion: 12,
      },
      rules: {
        // Inside .mdx files it always throws this rule when there is a title tag, no matter what, so skipping
        'jsx-a11y/heading-has-content': 'off',
      },
    },
    // Only uses Testing Library lint rules in test files
    {
      files: ['**/__tests__/**/*.[jt]s?(x)', '**/?(*.)+(spec|test).[jt]s?(x)'],
      extends: ['plugin:testing-library/react'],
    },
  ],
};
