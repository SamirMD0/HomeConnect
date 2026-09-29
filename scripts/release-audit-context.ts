import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { execFileSync } from 'child_process';
import dotenv from 'dotenv';
import { PrismaClient } from '@prisma/client';
import { MigrationRunner } from '../backend/src/features/maintenance/migration-runner';
import { scanSqlForUnsafeStatements } from '../backend/src/features/maintenance/sql-safety-scanner';

const root = process.cwd();
const evidence = path.join(root, '.claude/pre-release-audit/evidence');
fs.mkdirSync(evidence, { recursive: true });
const git = (...args: string[]) => execFileSync('git', args, { encoding: 'utf8' }).trim();
const save = (name: string, value: unknown) =>
  fs.writeFileSync(path.join(evidence, name), JSON.stringify(value, null, 2));

async function main() {
  const files = git('ls-files', '--cached', '--others', '--exclude-standard')
    .split('\n')
    .filter(Boolean);
  save('source-checkpoint.json', {
    timestamp: new Date().toISOString(),
    head: git('rev-parse', 'HEAD'),
    base: git('merge-base', 'main', 'HEAD'),
    branch: git('branch', '--show-current'),
    status: git('status', '--short'),
    commits: git('log', 'main..HEAD', '--format=%h %s').split('\n'),
    diffStat: git('diff', 'main...HEAD', '--stat'),
    hashes: Object.fromEntries(
      files
        .filter((f) => fs.existsSync(f) && fs.statSync(f).isFile())
        .map((f) => [f, crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex')])
    ),
  });
  const migrations = MigrationRunner.readBundled(path.join(root, 'backend/prisma/migrations'));
  const changed = new Set(
    git('diff', 'main', '--name-only', '--', 'backend/prisma/migrations')
      .split('\n')
      .map((f) => f.split('/')[3])
  );
  save(
    'migration-scan.json',
    migrations.map((m) => ({
      name: m.name,
      sinceMain: changed.has(m.name) || m.name === '20260926130000_add_product_csv_imports',
      ...scanSqlForUnsafeStatements(m.sql),
    }))
  );
  const env = dotenv.parse(fs.readFileSync(path.join(root, 'backend/.env')));
  const url = new URL(env.DATABASE_URL);
  console.log(
    JSON.stringify({
      source: { host: url.hostname, port: url.port, database: url.pathname.slice(1) },
      envKeys: Object.keys(env),
      migrationCount: migrations.length,
    })
  );
  const adminUrl = new URL(url);
  adminUrl.pathname = '/postgres';
  const client = new PrismaClient({ datasources: { db: { url: adminUrl.toString() } } });
  try {
    const databases = await client.$queryRaw<
      Array<{ datname: string }>
    >`SELECT datname FROM pg_database WHERE NOT datistemplate ORDER BY datname`;
    console.log(JSON.stringify({ databases }));
  } finally {
    await client.$disconnect();
  }
}
main().catch((e) => {
  console.error(e.code ?? e.name, 'Audit context failed; connection details suppressed.');
  process.exitCode = 1;
});
