// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');

module.exports = defineConfig([
  expoConfig,
  {
    ignores: ['dist/*'],
  },
  {
    // packages/chatuikit is a standalone module: nothing in it may
    // reach into the app. Everything it needs arrives through
    // ChatUiKitProvider — this rule is what keeps that true after
    // the next quick fix
    files: ['packages/chatuikit/**/*.{ts,tsx}', 'packages/chatengine/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            { group: ['@/*'], message: 'a package must not import from the app — pass it through its provider' },
            { group: ['@knf/*'], message: 'the packages stay independent of each other — they meet in the app' },
            { group: ['../../../*', '../../../../*', '../../../../../*'], message: 'chatuikit must not import from outside its package' },
          ],
        },
      ],
    },
  },
]);
