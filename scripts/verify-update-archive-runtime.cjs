// Run with Electron and ELECTRON_RUN_AS_NODE=1 against the release resources.
// Uses a disposable installation and a synthetic backup, never a live database.
const assert = require('node:assert/strict');
const fs = require('original-fs').promises;
const patchedFs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');

const resources = path.resolve(process.argv[2]);
const desktop = path.join(resources, 'app.asar/dist/electron/desktop/src');
const { prepareRollback, rollbackStatePath, readRollback } = require(path.join(desktop, 'update-rollback.js'));
const { recover } = require(path.join(desktop, 'rollback-helper.cjs'));
const digest = async file => crypto.createHash('sha256').update(await fs.readFile(file)).digest('hex');

async function main() {
  const fixtureParent = path.resolve('e2e/.runtime');
  await fs.mkdir(fixtureParent, { recursive: true });
  const fixture = await fs.mkdtemp(path.join(fixtureParent, 'archive-recovery-'));
  assert.ok(fixture.startsWith(fixtureParent + path.sep));
  const installDir = path.join(fixture, 'install');
  const userDataDir = path.join(fixture, 'user-data');
  await fs.mkdir(path.join(installDir, 'resources'), { recursive: true });
  await fs.writeFile(path.join(installDir, 'HomeConnect.exe'), 'disposable executable fixture');
  const archive = path.join(installDir, 'resources/app.asar');
  await fs.copyFile(path.join(resources, 'app.asar'), archive);
  // Confirm the fixture exercises Electron's virtual-ASAR behavior.
  assert.equal((await patchedFs.stat(archive)).isDirectory(), true);
  assert.equal((await fs.stat(archive)).isFile(), true);
  const originalHash = await digest(archive);
  let backupCalls = 0;
  let watchdogArmed = false;
  const state = await prepareRollback({
    from: '2.0.7', to: '2.0.8', installDir, userDataDir,
    envFilePath: path.join(userDataDir, 'config/production.env'), databaseUrl: 'postgresql://synthetic/never_connected',
    pgDump: 'synthetic-pg-dump', pgRestore: 'synthetic-pg-restore', psql: 'synthetic-psql',
    runCommand: async (_command, args) => {
      backupCalls++;
      if (args.includes('-Fc')) await fs.writeFile(args[args.indexOf('-f') + 1], 'synthetic backup');
    },
    launchWatchdog: async () => { watchdogArmed = true; },
  });
  assert.equal(backupCalls, 2);
  assert.equal(watchdogArmed, true);
  assert.ok(state.files.some(file => file.name === path.join('resources', 'app.asar')));
  assert.ok(!state.files.some(file => file.name.startsWith(path.join('resources', 'app.asar') + path.sep)));
  assert.equal(await digest(path.join(state.snapshotDir, 'resources/app.asar')), originalHash);
  // Use another valid archive as the failed update, so recovery also encounters
  // Electron's virtual archive behavior at its destination.
  const changedArchive = path.join(resources, 'default_app.asar');
  await fs.copyFile(changedArchive, archive);
  assert.notEqual(await digest(archive), originalHash);
  let relaunched = false;
  await recover(rollbackStatePath(userDataDir), state, {
    skipProcessWait: true,
    run: async () => { throw new Error('An unchanged database must not be restored'); },
    launch: async () => { relaunched = true; },
  });
  assert.equal(await digest(archive), originalHash);
  assert.equal((await readRollback(userDataDir)).status, 'rolled-back');
  assert.equal(relaunched, true);
  const evidence = { usesBusinessDatabase: false, physicalArchiveSnapshot: true, exactArchiveRestored: true,
    archivedHelperExtracted: true, watchdogArmed, relaunched, fixture };
  await fs.writeFile(path.join(resources, '../../update-archive-verification.json'), JSON.stringify(evidence, null, 2));
  console.log(JSON.stringify(evidence));
}
main().catch(error => { console.error(error); process.exitCode = 1; });
