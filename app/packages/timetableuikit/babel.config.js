// -----------------------------------------------------------
//  [*] @knf/timetableuikit — babel (package-level test runs only)
//
//  Used when jest runs from this directory; the host's root
//  babel.config.js governs app builds and the root jest run.
// -----------------------------------------------------------

module.exports = function (api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
  };
};
