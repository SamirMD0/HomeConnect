/* eslint-disable @typescript-eslint/no-require-imports -- Standalone CommonJS QA runner, executed directly by Node. */
// A disposable browser copy, never a web credential fallback in the native app.
const fs = require('fs'),
  path = require('path'),
  { spawn } = require('child_process');
const root = path.resolve(__dirname, '../..'),
  mobile = path.join(root, 'Mobile Scanner');
const preview = path.join(root, 'logs/mobile-lookup-preview');
fs.mkdirSync(preview, { recursive: true });
for (const name of ['app', 'src', 'assets', 'index.ts', 'package.json', 'app.json'])
  fs.cpSync(path.join(mobile, name), path.join(preview, name), { recursive: true });
if (!fs.existsSync(path.join(preview, 'node_modules')))
  fs.symlinkSync(path.join(mobile, 'node_modules'), path.join(preview, 'node_modules'), 'junction');
const tsconfig = JSON.parse(fs.readFileSync(path.join(mobile, 'tsconfig.json'), 'utf8'));
tsconfig.compilerOptions.paths['@shared/*'] = [path.join(root, 'shared/*')];
fs.writeFileSync(path.join(preview, 'tsconfig.json'), JSON.stringify(tsconfig, null, 2));
fs.writeFileSync(
  path.join(preview, 'fixture-secure.ts'),
  `
const values = new Map([
 ['homeconnect.scanner.connection.v1', JSON.stringify({ host: '127.0.0.1', port: 3011 })],
 ['homeconnect.scanner.auth-access-token.v1', 'fixture-lookup'],
 ['homeconnect.scanner.auth-refresh-token.v1', 'fixture-refresh'],
 ['homeconnect.scanner.auth-user.v1', JSON.stringify({ id: 'fixture-user', username: 'operator', fullName: 'Fixture Operator', role: 'ADMIN' })],
]);
export const WHEN_UNLOCKED_THIS_DEVICE_ONLY = 1;
export const isAvailableAsync = async () => true;
export const getItemAsync = async (key: string) => values.get(key) ?? null;
export const setItemAsync = async (key: string, value: string) => { values.set(key, value); };
export const deleteItemAsync = async (key: string) => { values.delete(key); };
`
);
fs.writeFileSync(
  path.join(preview, 'fixture-fs.ts'),
  `
export const documentDirectory = 'preview://';
const files = new Map<string, string>();
export const makeDirectoryAsync = async () => {};
export const copyAsync = async ({ from, to }) => { files.set(to, files.get(from) ?? ''); };
export const moveAsync = async ({ from, to }) => { files.set(to, files.get(from) ?? ''); files.delete(from); };
export const deleteAsync = async (uri) => { files.delete(uri); };
export const getInfoAsync = async (uri) => ({ exists: files.has(uri), size: 0 });
export const readAsStringAsync = async (uri) => files.get(uri) ?? '';
export const writeAsStringAsync = async (uri, content) => { files.set(uri, content); };
export const FileSystemUploadType = { BINARY_CONTENT: 0 };
export const uploadAsync = async () => { throw new Error('Writes are not part of lookup QA'); };
`
);
fs.writeFileSync(
  path.join(preview, 'fixture-camera.tsx'),
  `
import { View } from 'react-native';
export const CameraView = Object.assign(View, { onModernBarcodeScanned: () => ({ remove() {} }), launchScanner: async () => {} });
export const useCameraPermissions = () => [{ granted: false }, async () => ({ granted: false })];
`
);
fs.writeFileSync(
  path.join(preview, 'metro.config.js'),
  `
const path = require('path');
const { getDefaultConfig } = require('expo/metro-config');
const config = getDefaultConfig(__dirname);
config.watchFolders = [${JSON.stringify(mobile)}, ${JSON.stringify(path.join(root, 'shared'))}];
config.resolver.nodeModulesPaths = [${JSON.stringify(path.join(mobile, 'node_modules'))}, ${JSON.stringify(path.join(root, 'node_modules'))}];
const expoDirectory = path.dirname(require.resolve('expo/package.json'));
config.resolver.extraNodeModules = { '@expo/vector-icons': path.dirname(require.resolve('@expo/vector-icons/package.json', { paths: [expoDirectory] })) };
config.resolver.resolveRequest = (context, name, platform) => {
 if (name.startsWith('@shared/')) return { type: 'sourceFile', filePath: path.join(${JSON.stringify(path.join(root, 'shared'))}, name.slice(8) + '.ts') };
 const fixtures = { 'expo-secure-store': 'fixture-secure.ts', 'expo-file-system/legacy': 'fixture-fs.ts', 'expo-camera': 'fixture-camera.tsx' };
 if (fixtures[name]) return { type: 'sourceFile', filePath: path.join(__dirname, fixtures[name]) };
 return context.resolveRequest(context, name, platform);
};
module.exports = config;
`
);
console.log('Prepared isolated lookup preview:', preview);
if (!process.argv.includes('--prepare-only')) {
  const child = spawn(
    process.execPath,
    [
      path.join(mobile, 'node_modules/expo/bin/cli'),
      'start',
      '--web',
      '--host',
      'localhost',
      '--max-workers',
      '2',
      '--port',
      '8087',
    ],
    {
      cwd: preview,
      env: { ...process.env, EXPO_OFFLINE: '1' },
      windowsHide: true,
      stdio: 'inherit',
    }
  );
  child.on('exit', (code) => {
    process.exitCode = code ?? 0;
  });
  process.on('SIGINT', () => child.kill('SIGINT'));
}
