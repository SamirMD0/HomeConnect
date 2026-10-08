// Standalone watchdog, run by the saved previous Electron executable outside the install directory.
// It survives both installer replacement and failures before the new main process can load.
const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawn, spawnSync } = require('node:child_process');
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const hash = async (file) => crypto.createHash('sha256').update(await fs.readFile(file)).digest('hex');
const inside = (parent, child) => {
  const relative = path.relative(path.resolve(parent), path.resolve(child));
  return relative === '' || (relative !== '..' && !relative.startsWith('..' + path.sep) && !path.isAbsolute(relative));
};
const exists = async (file) => { try { await fs.access(file); return true; } catch { return false; } };
const alive = (pid) => { try { process.kill(pid, 0); return true; } catch { return false; } };
async function run(command, args, env) {
  await new Promise((resolve, reject) => {
    const child = spawn(command, args, { env, windowsHide: true, shell: false, stdio: 'ignore' });
    const timer = setTimeout(() => { child.kill(); reject(new Error('Recovery tool timed out')); }, 300000);
    child.once('error', () => { clearTimeout(timer); reject(new Error('Recovery tool could not start')); });
    child.once('close', (code) => { clearTimeout(timer); code === 0 ? resolve() : reject(new Error('Recovery tool failed')); });
  });
}
async function save(file, state) {
  await fs.writeFile(file + '.helper.tmp', JSON.stringify(state));
  await fs.rename(file + '.helper.tmp', file);
}
async function recover(file, state, tools = {}) {
  const root = path.join(state.userDataDir, 'update-rollback');
  if (!inside(root, state.snapshotDir) || !inside(root, state.backupPath)
    || inside(state.installDir, root) || inside(root, state.installDir)
    || path.basename(state.installDir) === state.installDir
    || !inside(state.userDataDir, file) || path.resolve(state.installDir) === path.parse(path.resolve(state.installDir)).root) {
    throw new Error('Invalid recovery paths');
  }
  if (await hash(state.backupPath) !== state.backupHash) throw new Error('Recovery backup checksum did not match');
  for (const entry of state.files) {
    const source = path.join(state.snapshotDir, entry.name);
    if (!inside(state.snapshotDir, source) || await hash(source) !== entry.sha256) throw new Error('Application snapshot checksum did not match');
  }
  // Never restore while the old app can still accept transactions or while a new backend is alive.
  if (!tools.skipProcessWait) {
    for (let i = 0; i < 60 && alive(state.parentPid); i++) await sleep(1000);
    if (alive(state.parentPid)) throw new Error('Previous app is still running');
    if (state.startupPid && alive(state.startupPid)) {
      spawnSync('taskkill.exe', ['/PID', String(state.startupPid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' });
      for (let i = 0; i < 30 && alive(state.startupPid); i++) await sleep(1000);
      if (alive(state.startupPid)) throw new Error('Updated app is still running');
    }
    // A syntax/module-load failure may occur before the new main process records its PID.
    // Find only processes whose executable is this installation, then stop their trees.
    const probe = spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command',
      'Get-CimInstance Win32_Process | Where-Object { $_.ExecutablePath -eq $env:HOME_CONNECT_ROLLBACK_EXE } | Select-Object -ExpandProperty ProcessId'],
      { windowsHide: true, encoding: 'utf8', timeout: 30000,
        env: { ...process.env, HOME_CONNECT_ROLLBACK_EXE: path.join(state.installDir, 'HomeConnect.exe') } });
    if (probe.status !== 0) throw new Error('Could not verify that the failed application stopped');
    for (const text of probe.stdout.trim().split(/\s+/).filter(Boolean)) {
      if (!/^\d+$/.test(text)) throw new Error('Could not identify the failed application');
      spawnSync('taskkill.exe', ['/PID', text, '/T', '/F'], { windowsHide: true, stdio: 'ignore' });
    }
  }
  if (state.databaseMayHaveChanged) {
    let databaseUrl = tools.databaseUrl || process.env.DATABASE_URL;
    if (!databaseUrl) {
      const dotenv = require(path.join(state.snapshotDir, 'resources', 'app.asar', 'node_modules', 'dotenv'));
      databaseUrl = dotenv.parse(await fs.readFile(state.envFilePath)).DATABASE_URL;
    }
    if (!databaseUrl) throw new Error('Database configuration is missing');
    const sqlFile = path.join(path.dirname(state.backupPath), 'restore.sql');
    const command = tools.run || run;
    await command(state.pgRestore, ['--no-owner', '--no-privileges', '--file', sqlFile, state.backupPath], process.env);
    // A single PostgreSQL transaction restores the complete public schema, including removal
    // of newly added objects. Any restore failure rolls back instead of leaving half-restored data.
    const sql = await fs.readFile(sqlFile, 'utf8');
    await fs.writeFile(sqlFile, sql.replace(/^CREATE SCHEMA (?:public|"public");$/gm, 'CREATE SCHEMA IF NOT EXISTS public;'));
    await command(state.psql, ['--no-password', '--dbname', databaseUrl, '--single-transaction', '--set', 'ON_ERROR_STOP=1',
      '--command', 'DROP SCHEMA public CASCADE; CREATE SCHEMA public;', '--file', sqlFile], process.env);
  }
  for (const entry of state.files) {
    const destination = path.join(state.installDir, entry.name);
    if (!inside(state.installDir, destination)) throw new Error('Invalid installation path');
    await fs.mkdir(path.dirname(destination), { recursive: true });
    let copied = false;
    for (let attempt = 0; attempt < 30 && !copied; attempt++) {
      try { await fs.copyFile(path.join(state.snapshotDir, entry.name), destination); copied = true; }
      catch (error) { if (!['EBUSY', 'EPERM', 'EACCES'].includes(error.code) || attempt === 29) throw error; await sleep(1000); }
    }
    if (await hash(destination) !== entry.sha256) throw new Error('Restored application checksum did not match');
  }
  // Receipt files are immutable; startup never accepts uploads before the update commits.
  await fs.writeFile(path.join(state.userDataDir, 'config', 'last-run-version.txt'), state.from);
  await save(file, { ...state, status: 'rolled-back' });
  const env = { ...process.env, HOME_CONNECT_USER_DATA: state.userDataDir };
  delete env.ELECTRON_RUN_AS_NODE;
  delete env.HOME_CONNECT_UPDATE_DISABLED;
  if (tools.launch) await tools.launch(path.join(state.installDir, 'HomeConnect.exe'), env);
  else {
    const child = spawn(path.join(state.installDir, 'HomeConnect.exe'), [], { detached: true, windowsHide: true, stdio: 'ignore', env, cwd: state.installDir });
    child.unref();
  }
}
async function watch(file) {
  let state;
  try {
    while (true) {
      state = JSON.parse(await fs.readFile(file, 'utf8'));
      if (['committed', 'cancelled', 'rolled-back', 'recovery-failed'].includes(state.status)) return;
      if (state.status === 'rollback-requested' || Date.now() > state.deadline) break;
      await sleep(1000);
    }
    await recover(file, state);
  } catch (error) {
    if (state) {
      await save(file, { ...state, status: 'recovery-failed', failure: error.message }).catch(() => {});
      await fs.appendFile(path.join(state.userDataDir, 'logs', 'update-recovery.log'), new Date().toISOString() + ' ' + error.message + '\n').catch(() => {});
    }
  }
}
module.exports = { recover, watch };
if (require.main === module) void watch(process.argv[2]);
