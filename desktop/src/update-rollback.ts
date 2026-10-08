import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';

export interface RollbackState {
  from: string;
  to: string;
  status: 'prepared' | 'starting' | 'committed' | 'rollback-requested' | 'rolled-back' | 'recovery-failed' | 'cancelled';
  installDir: string;
  snapshotDir: string;
  userDataDir: string;
  envFilePath: string;
  backupPath: string;
  backupHash: string;
  pgRestore: string;
  psql: string;
  databaseMayHaveChanged: boolean;
  parentPid: number;
  startupPid?: number;
  failure?: string;
  deadline: number;
  files: Array<{ name: string; sha256: string }>;
}

export const rollbackStatePath = (userDataDir: string) => path.join(userDataDir, 'config', 'update-rollback.json');
export async function readRollback(userDataDir: string): Promise<RollbackState | null> {
  try { return JSON.parse(await fs.readFile(rollbackStatePath(userDataDir), 'utf8')); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null; throw error; }
}
export async function writeRollback(state: RollbackState): Promise<void> {
  const file = rollbackStatePath(state.userDataDir);
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(`${file}.tmp`, JSON.stringify(state));
  await fs.rename(`${file}.tmp`, file);
}
export async function updateRollback(userDataDir: string, version: string, changes: Partial<RollbackState>) {
  const state = await readRollback(userDataDir);
  if (!state || state.to !== version || !['prepared', 'starting'].includes(state.status)) return false;
  await writeRollback({ ...state, ...changes });
  return true;
}
export async function hashFile(file: string) {
  return crypto.createHash('sha256').update(await fs.readFile(file)).digest('hex');
}
export async function snapshotFiles(base: string, relative = ''): Promise<RollbackState['files']> {
  const result: RollbackState['files'] = [];
  for (const entry of await fs.readdir(path.join(base, relative), { withFileTypes: true })) {
    const name = path.join(relative, entry.name);
    if (entry.isDirectory()) result.push(...await snapshotFiles(base, name));
    else if (entry.isFile()) result.push({ name, sha256: await hashFile(path.join(base, name)) });
    else throw new Error('An installation snapshot cannot contain links');
  }
  return result;
}
export function isInside(parent: string, child: string) {
  const relative = path.relative(path.resolve(parent), path.resolve(child));
  return relative === '' || (!relative.startsWith('..' + path.sep) && relative !== '..' && !path.isAbsolute(relative));
}

export async function runRollbackCommand(command: string, args: string[], env = process.env): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const child = spawn(command, args, { env, shell: false, windowsHide: true, stdio: 'ignore' });
    const timer = setTimeout(() => { child.kill(); reject(new Error('Update recovery tool timed out')); }, 300_000);
    child.once('error', () => { clearTimeout(timer); reject(new Error('Update recovery tool could not start')); });
    child.once('close', (code) => { clearTimeout(timer); code === 0 ? resolve() : reject(new Error('Update recovery tool failed')); });
  });
}

export interface PrepareRollbackOptions {
  from: string;
  to: string;
  installDir: string;
  userDataDir: string;
  envFilePath: string;
  databaseUrl: string;
  pgDump: string;
  pgRestore: string;
  psql: string;
  receiptsDir?: string;
  helperPath?: string;
  runCommand?: typeof runRollbackCommand;
  launchWatchdog?: (state: RollbackState, helper: string) => Promise<void>;
}

// This runs while the old backend is stopped. If any step fails, no installer is launched.
export async function prepareRollback(options: PrepareRollbackOptions): Promise<RollbackState> {
  if (!/^\d+\.\d+\.\d+$/.test(options.from) || !/^\d+\.\d+\.\d+$/.test(options.to) || options.from === options.to) {
    throw new Error('Invalid update versions');
  }
  if (isInside(options.installDir, options.userDataDir) || isInside(options.userDataDir, options.installDir)) {
    throw new Error('Installation and recovery directories must be separate');
  }
  const previous = await readRollback(options.userDataDir);
  if (previous?.to === options.to && ['rolled-back', 'recovery-failed'].includes(previous.status)) {
    throw new Error('This update was already rejected');
  }
  const root = path.join(options.userDataDir, 'update-rollback', `${options.from}-to-${options.to}-${Date.now()}`);
  const snapshotDir = path.join(root, 'app');
  await fs.mkdir(root, { recursive: true });
  await fs.cp(options.installDir, snapshotDir, { recursive: true, dereference: false, errorOnExist: true, force: false });
  const files = await snapshotFiles(snapshotDir);
  if (!files.some((file) => file.name.toLowerCase() === 'homeconnect.exe') || !files.some((file) => file.name === path.join('resources', 'app.asar'))) {
    throw new Error('Previous application snapshot is incomplete');
  }
  const backupPath = path.join(root, 'database.backup');
  await (options.runCommand ?? runRollbackCommand)(options.pgDump, ['--no-password', '-Fc', '-f', backupPath, options.databaseUrl]);
  if ((await fs.stat(backupPath)).size < 1) throw new Error('Update backup is empty');
  await (options.runCommand ?? runRollbackCommand)(options.pgRestore, ['--list', backupPath]);
  if (options.receiptsDir) {
    try { await fs.cp(options.receiptsDir, path.join(root, 'receipts'), { recursive: true, dereference: false }); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
  }
  const helper = path.join(root, 'rollback-helper.cjs');
  await fs.copyFile(options.helperPath ?? path.join(__dirname, 'rollback-helper.cjs'), helper);
  const state: RollbackState = {
    from: options.from, to: options.to, status: 'prepared', installDir: path.resolve(options.installDir),
    snapshotDir, userDataDir: path.resolve(options.userDataDir), envFilePath: options.envFilePath,
    backupPath, backupHash: await hashFile(backupPath), pgRestore: options.pgRestore, psql: options.psql,
    databaseMayHaveChanged: false, parentPid: process.pid, deadline: Date.now() + 600_000, files,
  };
  await writeRollback(state);
  try {
    if (options.launchWatchdog) await options.launchWatchdog(state, helper);
    else await new Promise<void>((resolve, reject) => {
      const child = spawn(path.join(snapshotDir, 'HomeConnect.exe'), [helper, rollbackStatePath(options.userDataDir)], {
        detached: true, windowsHide: true, stdio: 'ignore', cwd: root,
        env: { ...process.env, ELECTRON_RUN_AS_NODE: '1', DATABASE_URL: options.databaseUrl },
      });
      child.once('error', reject);
      child.once('spawn', () => { child.unref(); resolve(); });
    });
  } catch (error) { await writeRollback({ ...state, status: 'cancelled' }); throw error; }
  return state;
}
