// -----------------------------------------------------------
//  [*] @knf/dataengine — jest
//
//  The package proves itself without a host: `npm test` here
//  runs every src/**/__tests__ spec with the jest-expo preset
//  (found through the host's node_modules) and this package's
//  own babel config. The host's root jest run picks the same
//  specs up too.
// -----------------------------------------------------------

module.exports = {
  preset: 'jest-expo',
  globalSetup: '<rootDir>/jest.globalSetup.js',
  // Relative to this file — jest resolves a config's rootDir against its own directory
  rootDir: '.',
  testMatch: ['<rootDir>/src/**/__tests__/**/*.test.ts?(x)', '<rootDir>/example/**/__tests__/**/*.test.ts?(x)'],
  transformIgnorePatterns: [
    'node_modules/(?!((jest-)?react-native|@react-native(-community)?)|expo(nent)?|@expo(nent)?/.*|@expo-google-fonts/.*|react-navigation|@react-navigation/.*|native-base|react-native-svg|nativewind|react-native-css-interop)',
  ],
  collectCoverageFrom: ['<rootDir>/src/**/*.{ts,tsx}', '!<rootDir>/src/**/__tests__/**'],
};
