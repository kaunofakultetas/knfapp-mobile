// -----------------------------------------------------------
//  [*] Babel — Expo preset with NativeWind JSX source
//
//  babel-preset-expo (SDK 54) auto-injects the Reanimated/
//  worklets plugin when react-native-reanimated is installed,
//  so it is not listed here. The '@' alias mirrors the '@/*'
//  path in tsconfig.json and '@knf/chatuikit' the packages/chatuikit
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
          alias: { '@': './', '@knf/chatuikit': './packages/chatuikit/src', '@knf/chatengine': './packages/chatengine/src', '@knf/dataengine': './packages/dataengine/src', '@knf/timetableengine': './packages/timetableengine/src', '@knf/timetableuikit': './packages/timetableuikit/src', '@knf/socialengine': './packages/socialengine/src', '@knf/socialuikit': './packages/socialuikit/src', '@knf/wayfindengine': './packages/wayfindengine/src', '@knf/wayfinduikit': './packages/wayfinduikit/src', '@knf/wayfindeditor': './packages/wayfindeditor/src', '@knf/wayfindsync': './packages/wayfindsync/src', '@knf/wayfindcapture': './packages/wayfindcapture/src' },
          extensions: ['.ios.js', '.android.js', '.js', '.ts', '.tsx', '.json'],
        },
      ],
    ],
  };
};
