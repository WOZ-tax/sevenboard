module.exports = {
  parser: '@typescript-eslint/parser',
  parserOptions: {
    sourceType: 'module',
    ecmaVersion: 2022,
  },
  plugins: ['@typescript-eslint/eslint-plugin'],
  extends: [
    'plugin:@typescript-eslint/recommended',
  ],
  root: true,
  env: {
    node: true,
    jest: true,
  },
  ignorePatterns: ['.eslintrc.js', 'dist/**', 'scripts/**'],
  rules: {
    // Prettier formatting is handled separately — no style errors from ESLint
    'prettier/prettier': 'off',

    // TypeScript strict rules that are noisy in NestJS boilerplate
    '@typescript-eslint/interface-name-prefix': 'off',
    '@typescript-eslint/explicit-function-return-type': 'off',
    '@typescript-eslint/explicit-module-boundary-types': 'off',

    // any usage: warn rather than error (NestJS DTOs and Prisma sometimes need it)
    '@typescript-eslint/no-explicit-any': 'warn',

    // Unused vars: warn, allow underscore-prefixed names for unused params
    '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],

    // NestJS decorators use empty interfaces (e.g. @Entity())
    '@typescript-eslint/no-empty-interface': 'off',

    // require() calls are common in NestJS config files
    '@typescript-eslint/no-var-requires': 'off',

    // Non-null assertions are used in controllers where entity is guaranteed by guard
    '@typescript-eslint/no-non-null-assertion': 'warn',
  },
};
