// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');

module.exports = defineConfig([
  expoConfig,
  {
    ignores: ['dist/*'],
  },
  {
    // packages/chatkit is a standalone module: nothing in it may
    // reach into the app. Everything it needs arrives through
    // ChatKitProvider — this rule is what keeps that true after
    // the next quick fix
    files: ['packages/chatkit/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            { group: ['@/*'], message: 'chatkit must not import from the app — pass it through ChatKitProvider' },
            { group: ['../../../*', '../../../../*', '../../../../../*'], message: 'chatkit must not import from outside its package' },
          ],
        },
      ],
    },
  },
]);
