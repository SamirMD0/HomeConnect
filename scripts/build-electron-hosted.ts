/**
 * Build a hosted-backend Electron installer.
 *
 * Usage:
 *   tsx scripts/build-electron-hosted.ts --api-url https://api.homeconnect.example.com/api/v1
 *   tsx scripts/build-electron-hosted.ts --api-url <url> --skip-installer   # just bundles, no NSIS
 *
 * Does NOT sign the installer (project policy — unsigned is an accepted
 * limitation on Windows for now).
 */
import { spawnSync } from 'node:child_process';
import { argv, exit } from 'node:process';

function parseFlag(name: string): string | undefined {
  const idx = argv.indexOf(`--${name}`);
  return idx > -1 ? argv[idx + 1] : undefined;
}

const apiUrl = parseFlag('api-url');
if (!apiUrl) {
  console.error('Missing --api-url. Example: --api-url https://api.homeconnect.example.com/api/v1');
  exit(2);
}
const skipInstaller = argv.includes('--skip-installer');

const env = { ...process.env, VITE_API_URL: apiUrl };

// Always: build the frontend + backend + electron main.
for (const cmd of ['npm run build', 'npm run build:electron-main']) {
  const [bin, ...rest] = cmd.split(' ');
  const r = spawnSync(bin, rest, { stdio: 'inherit', env, shell: true });
  if (r.status !== 0) { console.error(`Failed: ${cmd}`); exit(r.status ?? 1); }
}

if (!skipInstaller) {
  const r = spawnSync('npm', ['run', 'dist:win'], { stdio: 'inherit', env, shell: true });
  if (r.status !== 0) { console.error('dist:win failed'); exit(r.status ?? 1); }
}

console.log(`\nHosted Electron build complete. VITE_API_URL baked as: ${apiUrl}`);
