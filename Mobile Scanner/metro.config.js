const path = require('path');
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);
config.watchFolders = [...(config.watchFolders ?? []), path.resolve(__dirname, '../shared')];
config.resolver.nodeModulesPaths = [path.resolve(__dirname, 'node_modules'), path.resolve(__dirname, '../node_modules')];
// npm may keep Expo's bundled icons nested. Resolve them from Expo's closure
// without declaring another dependency in the companion app.
const expoDirectory = path.dirname(require.resolve('expo/package.json'));
config.resolver.extraNodeModules = {
  ...config.resolver.extraNodeModules,
  '@expo/vector-icons': path.dirname(require.resolve('@expo/vector-icons/package.json', { paths: [expoDirectory] })),
};

// Runtime shared modules (money/date formatting and report metadata) must also
// resolve in Metro, independently of editor-only TypeScript path aliases.
config.resolver.resolveRequest = (context, name, platform) => {
  if (name.startsWith('@shared/')) {
    return { type: 'sourceFile', filePath: path.resolve(__dirname, '../shared', `${name.slice(8)}.ts`) };
  }
  return context.resolveRequest(context, name, platform);
};

module.exports = config;
