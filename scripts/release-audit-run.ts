import fs from 'fs';
import path from 'path';
import { spawn, spawnSync } from 'child_process';

const task = process.argv[2];
if (
  ![
    'typecheck',
    'typecheck:electron',
    'lint',
    'test:ci',
    'build',
    'build:electron-main',
    'pack:win',
    'dist:win',
  ].includes(task)
)
  throw new Error('Unknown audit task');
const db = JSON.parse(fs.readFileSync('e2e/.runtime/databases.json', 'utf8'));
if (!/^hc_audit_test_ci(?:_phase4_phase5_phase6)?_\d+$/.test(new URL(db.urls.ci).pathname.slice(1)))
  throw new Error('Unsafe test database');
const directory = '.claude/pre-release-audit/evidence';
const startedAt = new Date();
const chunks: string[] = [];
if (task === 'test:ci') {
  const check = spawnSync(process.execPath, ['scripts/assert-migration-drift-allowlisted.mjs'], {
    env: { ...process.env, DATABASE_URL: db.urls.ci },
    windowsHide: true,
    encoding: 'utf8',
  });
  if (check.status !== 0) throw new Error(`Migration drift audit failed (${check.status}): ${(check.stderr || check.stdout).trim()}`);
  console.log(check.stdout.trim());
}
const child = spawn(
  process.execPath,
  [path.join(path.dirname(process.execPath), 'node_modules/npm/bin/npm-cli.js'), 'run', task],
  {
    env: {
      ...process.env,
      DATABASE_URL: db.urls.ci,
      JWT_SECRET: db.JWT_SECRET,
      JWT_REFRESH_SECRET: db.JWT_REFRESH_SECRET,
      ...(process.argv.includes('--e2e') ? { VITE_API_URL: 'http://127.0.0.1:4311/api/v1' } : {}),
    },
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe'],
  }
);
for (const stream of [child.stdout, child.stderr])
  stream.on('data', (chunk) => chunks.push(String(chunk)));
child.on('error', (e) => {
  console.error(e.code);
  process.exitCode = 1;
});
child.on('exit', (code) => {
  const text = chunks.join('').replace(/postgres(?:ql)?:\/\/\S+/g, '[DATABASE_URL REDACTED]');
  const name = task.replaceAll(':', '-');
  fs.writeFileSync(`${directory}/${name}.log`, text);
  fs.writeFileSync(
    `${directory}/${name}.json`,
    JSON.stringify(
      {
        task,
        startedAt,
        finishedAt: new Date(),
        durationMs: Date.now() - startedAt.getTime(),
        exitCode: code,
      },
      null,
      2
    )
  );
  if (task === 'test:ci' && fs.existsSync('node_modules/.cache/home-connect/vitest-report.json'))
    fs.copyFileSync(
      'node_modules/.cache/home-connect/vitest-report.json',
      `${directory}/vitest-report.json`
    );
  console.log(text.slice(-5000));
  process.exitCode = code ?? 1;
});
