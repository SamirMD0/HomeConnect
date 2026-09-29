import { spawn } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, describe, expect, it } from 'vitest';

/**
 * The server reads `JWT_SECRET` while its modules are still being loaded
 * (`auth.service.ts` and `auth.middleware.ts` capture it at module scope), so
 * the env file has to be on `process.env` *before* the first application import
 * is evaluated. Import statements are hoisted above ordinary statements, so a
 * `dotenv.config()` call written below the imports never runs in time — the
 * failure only shows up when the real entrypoint is launched as its own
 * process, which is what this test does.
 */

const repoRoot = path.resolve(__dirname, '../..');
const tsxCli = path.join(repoRoot, 'node_modules', 'tsx', 'dist', 'cli.mjs');
const entrypoint = path.join(repoRoot, 'backend', 'src', 'index.ts');

let workDir: string | undefined;

afterEach(() => {
  if (workDir) fs.rmSync(workDir, { recursive: true, force: true });
  workDir = undefined;
});

function startServer(): Promise<string> {
  workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'home-connect-env-'));
  const envFile = path.join(workDir, 'production.env');
  fs.writeFileSync(
    envFile,
    [
      'JWT_SECRET=load-env-regression-secret-at-least-32-characters',
      'JWT_REFRESH_SECRET=load-env-regression-refresh-at-least-32-characters',
      'DATABASE_URL=postgresql://unused:unused@127.0.0.1:1/home_connect_never_connected',
      '',
    ].join('\n'),
  );

  // A deliberately bare environment: the secrets exist only inside the env file,
  // exactly like a fresh install driven by Setup-HomeConnect.ps1.
  const child = spawn(process.execPath, [tsxCli, entrypoint], {
    cwd: repoRoot,
    env: {
      PATH: process.env.PATH,
      SystemRoot: process.env.SystemRoot,
      TEMP: process.env.TEMP,
      TMP: process.env.TMP,
      NODE_ENV: 'development',
      BACKEND_ENV_FILE: envFile,
      HOST: '127.0.0.1',
      PORT: '0',
      LOG_DIR: path.join(workDir, 'logs'),
      BACKUP_DIR: path.join(workDir, 'backups'),
    },
    windowsHide: true,
  });

  return new Promise<string>((resolve) => {
    let output = '';
    const settle = () => {
      child.kill();
      resolve(output);
    };

    const collect = (chunk: Buffer) => {
      output += String(chunk);
      if (output.includes('Server running on')) settle();
    };

    child.stdout.on('data', collect);
    child.stderr.on('data', collect);
    child.on('exit', () => resolve(output));
    setTimeout(settle, 20_000).unref();
  });
}

describe('server env bootstrap', () => {
  it('loads the env file before the modules that read it', async () => {
    const output = await startServer();

    expect(output).not.toContain('Missing required environment variable JWT_SECRET');
  }, 30_000);
});
