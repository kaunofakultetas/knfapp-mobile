// -----------------------------------------------------------
//  [*] Babel — Expo preset with NativeWind JSX source
//
//  babel-preset-expo (SDK 54) auto-injects the Reanimated/
//  worklets plugin when react-native-reanimated is installed,
//  so it is not listed here. The single '@' alias mirrors the
//  '@/*' path in tsconfig.json — keep the two in sync.
// -----------------------------------------------------------

module.exports = function (api) {
  api.cache(true);
  return {
    presets: [['babel-preset-expo', { jsxImportSource: 'nativewind' }]],
    plugins: [
      [
        'module-resolver',
        {
          alias: { '@': './' },
          extensions: ['.ios.js', '.android.js', '.js', '.ts', '.tsx', '.json'],
        },
      ],
    ],
  };
};
