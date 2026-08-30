// -----------------------------------------------------------
//  [*] Babel — Expo preset with NativeWind JSX source
//
//  babel-preset-expo (SDK 54) auto-injects the Reanimated/
//  worklets plugin when react-native-reanimated is installed,
//  so it is not listed here. The '@' alias mirrors the '@/*'
//  path in tsconfig.json and '@knf/chatkit' the packages/chatkit
//  path — keep both pairs in sync.
// -----------------------------------------------------------

module.exports = function (api) {
  api.cache(true);
  return {
    presets: [['babel-preset-expo', { jsxImportSource: 'nativewind' }]],
    plugins: [
      [
        'module-resolver',
        {
          alias: { '@': './', '@knf/chatkit': './packages/chatkit/src' },
          extensions: ['.ios.js', '.android.js', '.js', '.ts', '.tsx', '.json'],
        },
      ],
    ],
  };
};
