import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
const started = Date.now();
const child = spawn(
  path.resolve('node_modules/electron/dist/electron.exe'),
  [
    '-e',
    'console.log(JSON.stringify({node:process.versions.node,electron:process.versions.electron,runAsNode:process.env.ELECTRON_RUN_AS_NODE}));process.exit(0)',
  ],
  {
    env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe'],
  }
);
const chunks: string[] = [];
child.stdout.on('data', (c) => chunks.push(String(c)));
child.stderr.on('data', (c) => chunks.push(String(c)));
const timeout = setTimeout(() => {
  chunks.push('Probe deadline exceeded');
  child.kill();
}, 15000);
child.on('exit', (code, signal) => {
  clearTimeout(timeout);
  const result = { durationMs: Date.now() - started, code, signal, output: chunks.join('') };
  fs.writeFileSync(
    '.claude/pre-release-audit/evidence/electron-node-probe.json',
    JSON.stringify(result, null, 2)
  );
  console.log(JSON.stringify(result));
});
