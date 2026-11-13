/* eslint-disable @typescript-eslint/no-require-imports -- Standalone Node QA preview. */
const fs = require('fs'), path = require('path'), { spawn } = require('child_process');
const root = path.resolve(__dirname, '../..'), mobile = path.join(root, 'Mobile Scanner'), preview = path.join(root, 'logs/mobile-sales-preview');
const session = JSON.parse(fs.readFileSync(path.join(root, 'node_modules/.cache/mobile-sales/session.json'), 'utf8'));
fs.mkdirSync(preview, { recursive: true });
for (const name of ['app', 'src', 'assets', 'index.ts', 'package.json', 'app.json']) fs.cpSync(path.join(mobile, name), path.join(preview, name), { recursive: true });
if (!fs.existsSync(path.join(preview, 'node_modules'))) fs.symlinkSync(path.join(mobile, 'node_modules'), path.join(preview, 'node_modules'), 'junction');
const tsconfig = JSON.parse(fs.readFileSync(path.join(mobile, 'tsconfig.json'), 'utf8')); tsconfig.compilerOptions.paths['@shared/*'] = [path.join(root, 'shared/*')];
fs.writeFileSync(path.join(preview, 'tsconfig.json'), JSON.stringify(tsconfig));
const initial = {
  'homeconnect.scanner.connection.v1': JSON.stringify({ host: '127.0.0.1', port: 3011 }),
  'homeconnect.scanner.auth-access-token.v1': session.admin.token,
  'homeconnect.scanner.auth-refresh-token.v1': session.admin.refreshToken,
  'homeconnect.scanner.auth-user.v1': JSON.stringify(session.admin.user),
};
fs.writeFileSync(path.join(preview, 'fixture-secure.ts'), `
const initial = ${JSON.stringify(initial)};
export const WHEN_UNLOCKED_THIS_DEVICE_ONLY = 1;
export const isAvailableAsync = async () => true;
export const getItemAsync = async (key) => localStorage.getItem('qa-secure:'+key) ?? initial[key] ?? null;
export const setItemAsync = async (key,value) => { localStorage.setItem('qa-secure:'+key,value); };
export const deleteItemAsync = async (key) => { localStorage.setItem('qa-secure:'+key,''); };
`);
fs.writeFileSync(path.join(preview, 'fixture-fs.ts'), `
export const documentDirectory = 'preview://';
const key=(uri)=>'qa-file:'+uri;
export const makeDirectoryAsync=async()=>{};
export const getInfoAsync=async(uri)=>({exists:localStorage.getItem(key(uri))!==null,size:0});
export const readAsStringAsync=async(uri)=>localStorage.getItem(key(uri))??'';
export const writeAsStringAsync=async(uri,value)=>{localStorage.setItem(key(uri),value);};
export const deleteAsync=async(uri)=>{localStorage.removeItem(key(uri));};
export const copyAsync=async({from,to})=>{localStorage.setItem(key(to),localStorage.getItem(key(from))??'');};
export const moveAsync=async(args)=>{await copyAsync(args);await deleteAsync(args.from);};
export const FileSystemUploadType={BINARY_CONTENT:0};
export const uploadAsync=async()=>{throw new Error('No native bill uploads in sales QA');};
`);
fs.writeFileSync(path.join(preview, 'fixture-camera.tsx'), `import{View}from'react-native';export const CameraView=Object.assign(View,{onModernBarcodeScanned:()=>({remove(){}}),launchScanner:async()=>{}});export const useCameraPermissions=()=>[{granted:false},async()=>({granted:false})];`);
fs.writeFileSync(path.join(preview, 'fixture-print.ts'), `export const printToFileAsync=async(options)=>{window.__receiptHtml=options.html;return{uri:'fixture://payment-receipt.pdf'};};`);
fs.writeFileSync(path.join(preview, 'fixture-sharing.ts'), `export const isAvailableAsync=async()=>true;export const shareAsync=async(uri,options)=>{window.__receiptShare={uri,...options};};`);
fs.writeFileSync(path.join(preview, 'metro.config.js'), `
const path=require('path'),{getDefaultConfig}=require('expo/metro-config');const config=getDefaultConfig(__dirname);
config.watchFolders=[${JSON.stringify(mobile)},${JSON.stringify(path.join(root, 'shared'))}];
config.resolver.nodeModulesPaths=[${JSON.stringify(path.join(mobile, 'node_modules'))},${JSON.stringify(path.join(root, 'node_modules'))}];
const expoDirectory=path.dirname(require.resolve('expo/package.json'));config.resolver.extraNodeModules={'@expo/vector-icons':path.dirname(require.resolve('@expo/vector-icons/package.json',{paths:[expoDirectory]}))};
config.resolver.resolveRequest=(context,name,platform)=>{if(name.startsWith('@shared/'))return{type:'sourceFile',filePath:path.join(${JSON.stringify(path.join(root, 'shared'))},name.slice(8)+'.ts')};const map={'expo-secure-store':'fixture-secure.ts','expo-file-system/legacy':'fixture-fs.ts','expo-camera':'fixture-camera.tsx','expo-print':'fixture-print.ts','expo-sharing':'fixture-sharing.ts'};return map[name]?{type:'sourceFile',filePath:path.join(__dirname,map[name])}:context.resolveRequest(context,name,platform);};module.exports=config;
`);
console.log('Prepared isolated sales preview (native browser adapters only).');
if (!process.argv.includes('--prepare-only')) {
  const child = spawn(process.execPath, [path.join(mobile, 'node_modules/expo/bin/cli'), 'start', '--web', '--host', 'localhost', '--max-workers', '2', '--port', '8088'], { cwd: preview, env: { ...process.env, EXPO_OFFLINE: '1' }, windowsHide: true, stdio: 'inherit' });
  child.on('exit', (code) => { process.exitCode = code ?? 0; }); process.on('SIGINT', () => child.kill('SIGINT'));
}
