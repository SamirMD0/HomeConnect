module.exports = function (api) {
  api.cache(true);
  return {
    // NativeWind compiles className into React Native styles.
    presets: [['babel-preset-expo', { jsxImportSource: 'nativewind' }], 'nativewind/babel'],
  };
};
