import { spawn } from 'child_process';
import fs from 'fs';
const start = Date.now();
const child = spawn(
  process.execPath,
  [
    'node_modules/electron-builder/cli.js',
    '--win',
    '--config.directories.output=release/audit-production-20260927',
    '--config.npmRebuild=false',
    '--publish=never',
  ],
  { env: process.env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] }
);
const output: string[] = [];
for (const stream of [child.stdout, child.stderr])
  stream.on('data', (chunk) => output.push(String(chunk)));
child.once('error', (error) => {
  console.error(error.message);
  process.exitCode = 1;
});
child.once('exit', (code) => {
  fs.writeFileSync('.claude/pre-release-audit/evidence/package.log', output.join(''));
  fs.writeFileSync(
    '.claude/pre-release-audit/evidence/package.json',
    JSON.stringify(
      {
        startedAt: new Date(start).toISOString(),
        durationMs: Date.now() - start,
        exitCode: code,
        publish: 'never',
        output: 'release/audit-production-20260927',
      },
      null,
      2
    )
  );
  console.log(output.join('').slice(-4000));
  process.exitCode = code ?? 1;
});
