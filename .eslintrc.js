module.exports = {
  root: true,
  parser: '@typescript-eslint/parser',
  extends: ['eslint:recommended', 'plugin:@typescript-eslint/recommended', 'prettier'],
  plugins: ['@typescript-eslint', 'import'],
  parserOptions: {
    ecmaVersion: 2021,
    sourceType: 'module',
  },
  env: { node: true, browser: true, jest: true },
  rules: {
    'interface-name': 'off',
    'no-console': 'off',
    'no-implicit-dependencies': 'off',
    'no-submodule-imports': 'off',
    'no-trailing-spaces': 'error',
    'no-unused-vars': ['error', { args: 'none' }],
    'react/jsx-key': 'off',
    // When hunting dead code it's useful to use the following:
    // ---
    // 'import/no-unused-modules': [1, { unusedExports: true }],
  },
};
