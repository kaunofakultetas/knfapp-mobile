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
    // The packages' SOURCE is sealed; their example/ folders are
    // documentation and may show the two packages used together
    files: ['packages/chatuikit/src/**/*.{ts,tsx}', 'packages/chatengine/src/**/*.{ts,tsx}', 'packages/dataengine/src/**/*.{ts,tsx}', 'packages/socialengine/src/**/*.{ts,tsx}', 'packages/socialuikit/src/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            { group: ['@/*'], message: 'a package must not import from the app — pass it through its provider' },
            { group: ['@knf/*'], message: 'the packages stay independent of each other — they meet in the app' },
          ],
        },
      ],
      // Relative imports may not resolve outside the package either
      // (tests live inside it now, at any depth)
      'import/no-restricted-paths': [
        'error',
        {
          zones: [
            { target: './packages/chatuikit/src', from: './', except: ['./packages/chatuikit/src', './node_modules'] },
            { target: './packages/chatengine/src', from: './', except: ['./packages/chatengine/src', './node_modules'] },
            { target: './packages/dataengine/src', from: './', except: ['./packages/dataengine/src', './node_modules'] },
            { target: './packages/socialengine/src', from: './', except: ['./packages/socialengine/src', './node_modules'] },
            { target: './packages/socialuikit/src', from: './', except: ['./packages/socialuikit/src', './node_modules'] },
          ],
        },
      ],
    },
  },
]);
