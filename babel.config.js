module.exports = function (api) {
  api.cache(true);
  return {
    presets: [['babel-preset-expo', { jsxImportSource: 'nativewind' }]],
    plugins: [
      [
        'module-resolver',
        {
          alias: {
            '@': './',
            '@/appScreens': './appScreens',
            '@/assets': './assets',
            '@/components': './components',
            '@/constants': './constants',
            '@/context': './context',
            '@/hooks': './hooks',
            '@/types': './types',
            '@/utils': './utils',
          },
          extensions: ['.ios.js', '.android.js', '.js', '.ts', '.tsx', '.json'],
        },
      ],
      // MUST be last
      'react-native-reanimated/plugin',
    ],
  };
};
