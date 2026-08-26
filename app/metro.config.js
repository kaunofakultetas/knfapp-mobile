// -----------------------------------------------------------
//  [*] Metro — NativeWind CSS + SVG-as-component support
//
//  The svg-transformer's /expo entry delegates non-SVG files
//  to Expo's own babel transformer; withNativeWind then wraps
//  the whole pipeline to compile global.css class names.
// -----------------------------------------------------------

const { getDefaultConfig } = require('expo/metro-config');
const { withNativeWind } = require('nativewind/metro');

const config = getDefaultConfig(__dirname);

// SVG files import as React components (see types/svg.d.ts)
config.transformer = {
  ...config.transformer,
  babelTransformerPath: require.resolve('react-native-svg-transformer/expo'),
};

config.resolver = {
  ...config.resolver,
  assetExts: config.resolver.assetExts.filter((ext) => ext !== 'svg'),
  sourceExts: [...config.resolver.sourceExts, 'svg'],
};

module.exports = withNativeWind(config, { input: './global.css' });
