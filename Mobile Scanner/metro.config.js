const path = require('path');
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);
// npm may keep Expo's bundled icons nested. Resolve them from Expo's closure
// without declaring another dependency in the companion app.
const expoDirectory = path.dirname(require.resolve('expo/package.json'));
config.resolver.extraNodeModules = {
  ...config.resolver.extraNodeModules,
  '@expo/vector-icons': path.dirname(require.resolve('@expo/vector-icons/package.json', { paths: [expoDirectory] })),
};

module.exports = config;
