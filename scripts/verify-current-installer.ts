import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import * as asar from '@electron/asar';
import { spawnSync } from 'node:child_process';

const root = process.cwd();
const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
const release = path.join(root, 'release', pkg.version);
const installer = path.join(release, `HomeConnect-Setup-${pkg.version}.exe`);
const resources = path.join(release, 'win-unpacked', 'resources');
const archive = path.join(resources, 'app.asar');
const hash = (data: Buffer) => crypto.createHash('sha256').update(data).digest('hex');

function files(base: string, relative = ''): string[] {
  return fs.readdirSync(path.join(base, relative), { withFileTypes: true }).flatMap((entry) => {
    const name = path.join(relative, entry.name);
    return entry.isDirectory() ? files(base, name) : [name.replaceAll('\\', '/')];
  });
}

function compareResources(source: string, bundled: string, include = (_name: string) => true) {
  const expected = files(source).filter(include).sort();
  const actual = files(bundled).sort();
  const missing = expected.filter((name) => !actual.includes(name));
  const extra = actual.filter((name) => !expected.includes(name));
  const changed = expected.filter((name) => actual.includes(name)
    && hash(fs.readFileSync(path.join(source, name))) !== hash(fs.readFileSync(path.join(bundled, name))));
  return { expected: expected.length, actual: actual.length, missing, extra, changed };
}

function main() {
  if (!fs.existsSync(installer) || !fs.existsSync(archive)) throw new Error('Current installer or app archive missing');
  const latest = fs.readFileSync(path.join(release, 'latest.yml'), 'utf8');
  const installerBytes = fs.readFileSync(installer);
  const sha512 = crypto.createHash('sha512').update(installerBytes).digest('base64');
  const asarPkg = JSON.parse(asar.extractFile(archive, 'package.json').toString('utf8'));
  const asarFiles = new Set(asar.listPackage(archive).map((name) => name.replaceAll('\\', '/').replace(/^\//, '')));
  const electronSource = path.join(root, 'dist/electron');
  const electronFiles = files(electronSource).filter((name) =>
    !name.endsWith('.d.ts') && !name.endsWith('.map') && !name.endsWith('.tsbuildinfo') && !/(?:\.test\.|\.spec\.)/.test(name));
  const electronMissing = electronFiles.filter((name) => !asarFiles.has(`dist/electron/${name}`));
  const electronChanged = electronFiles.filter((name) => !electronMissing.includes(name)
    && hash(fs.readFileSync(path.join(electronSource, name)))
      !== hash(asar.extractFile(archive, path.join('dist/electron', name))));
  const frontend = compareResources(path.join(root, 'frontend/dist'), path.join(resources, 'frontend/dist'));
  const backend = compareResources(path.join(root, 'dist/server/backend'), path.join(resources, 'dist/server/backend'),
    (name) => !/(?:\.test\.|\.spec\.)/.test(name));
  const migrations = compareResources(path.join(root, 'backend/prisma/migrations'), path.join(resources, 'prisma/migrations'),
    (name) => name.endsWith('.sql') || name.endsWith('migration_lock.toml'));
  const repair = compareResources(path.join(root, 'backend/prisma/repair'), path.join(resources, 'repair'),
    (name) => name.endsWith('.sql') || name === 'manifest.json');
  const runtimePackages = Object.fromEntries(['dompurify', 'qs', 'undici'].map((name) => {
    const manifest = JSON.parse(asar.extractFile(archive, path.join('node_modules', name, 'package.json')).toString('utf8'));
    return [name, manifest.version];
  }));
  const clientHasAuditUrl = files(path.join(root, 'frontend/dist')).some((name) => name.endsWith('.js')
    && fs.readFileSync(path.join(root, 'frontend/dist', name), 'utf8').includes('127.0.0.1:4311'));
  const forbiddenResources = files(resources).filter((name) => /(?:^|\/)(?:\.env(?:\..*)?|.*\.backup|databases\.json)$/.test(name));
  const schemaEngine = path.join(resources, 'app.asar.unpacked/node_modules/@prisma/engines/schema-engine-windows.exe');
  const engineProbe = spawnSync(path.join(release, 'win-unpacked/HomeConnect.exe'),
    [path.join(archive, 'node_modules/prisma/build/index.js'), '--version'], {
      env: { ...process.env, ELECTRON_RUN_AS_NODE: '1', PRISMA_SCHEMA_ENGINE_BINARY: schemaEngine, PRISMA_HIDE_UPDATE_MESSAGE: '1' },
      windowsHide: true, encoding: 'utf8', timeout: 30_000,
    });
  const packagedMigrationEngineWorks = engineProbe.status === 0 && !engineProbe.stdout.includes('E_CANNOT_RESOLVE_VERSION');
  const result = {
    version: pkg.version,
    installer: path.relative(root, installer).replaceAll('\\', '/'),
    bytes: installerBytes.length,
    sha256: hash(installerBytes),
    latestVersionMatches: latest.includes(`version: ${pkg.version}`),
    latestFileHashMatches: latest.includes(`sha512: ${sha512}`),
    latestFileSizeMatches: latest.includes(`size: ${installerBytes.length}`),
    asarVersionMatches: asarPkg.version === pkg.version,
    asarMainMatches: asarPkg.main === pkg.main,
    electron: { expected: electronFiles.length, missing: electronMissing, changed: electronChanged },
    frontend,
    backend,
    migrations,
    repair,
    runtimePackages,
    clientHasAuditUrl,
    forbiddenResources,
    packagedMigrationEngineWorks,
  };
  fs.writeFileSync('.claude/pre-release-audit/evidence/current-installer-verification.json', JSON.stringify(result, null, 2));
  console.log(JSON.stringify({
    version: result.version,
    bytes: result.bytes,
    sha256: result.sha256,
    metadataMatches: result.latestVersionMatches && result.latestFileHashMatches && result.latestFileSizeMatches
      && result.asarVersionMatches && result.asarMainMatches,
    electron: { expected: result.electron.expected, missing: result.electron.missing.length, changed: result.electron.changed.length },
    resources: Object.fromEntries((['frontend', 'backend', 'migrations', 'repair'] as const).map((name) => [name, {
      expected: result[name].expected, actual: result[name].actual,
      missing: result[name].missing.length, extra: result[name].extra.length, changed: result[name].changed.length,
    }])),
    runtimePackages: result.runtimePackages,
    clientHasAuditUrl,
    forbiddenResources: forbiddenResources.length,
    packagedMigrationEngineWorks,
  }));
  const clean = [frontend, backend, migrations, repair].every((group) =>
    group.missing.length === 0 && group.extra.length === 0 && group.changed.length === 0);
  if (!clean || electronMissing.length || electronChanged.length || clientHasAuditUrl || forbiddenResources.length
    || !result.latestVersionMatches || !result.latestFileHashMatches || !result.latestFileSizeMatches
    || !result.asarVersionMatches || !result.asarMainMatches || !packagedMigrationEngineWorks)
    process.exitCode = 1;
}

main();
