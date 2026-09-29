/** Isolated release rehearsal. Source connection is used only for SELECT and pg_dump. */
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { spawnSync } from 'child_process';
import dotenv from 'dotenv';
import { PrismaClient } from '@prisma/client';
import {
  MigrationExecutor,
  MigrationClient,
} from '../backend/src/features/maintenance/migration-executor';

const root = process.cwd();
const evidence = path.join(root, '.claude/pre-release-audit/evidence');
const runtime = path.join(root, 'e2e/.runtime');
const source = new URL(dotenv.parse(fs.readFileSync('backend/.env')).DATABASE_URL);
const stamp = new Date().toISOString().replace(/\D/g, '').slice(0, 14);
const pgBin = process.env.AUDIT_PG_BIN || 'D:/Program Files/PostgreSQL/18/bin';
fs.mkdirSync(runtime, { recursive: true });
fs.mkdirSync(evidence, { recursive: true });
const save = (file: string, data: unknown) =>
  fs.writeFileSync(path.join(evidence, file), JSON.stringify(data, null, 2));
const urlFor = (name: string) => {
  const url = new URL(source);
  url.pathname = `/${name}`;
  return url.toString();
};
function run(command: string, args: string[], env: NodeJS.ProcessEnv, log: string) {
  const start = Date.now();
  const result = spawnSync(command, args, {
    env,
    encoding: 'utf8',
    windowsHide: true,
    timeout: 240000,
    maxBuffer: 16 * 1024 * 1024,
  });
  fs.writeFileSync(
    path.join(evidence, log),
    `${result.stdout || ''}\n${result.stderr || ''}`.replace(
      /postgres(?:ql)?:\/\/\S+/g,
      '[DATABASE_URL REDACTED]'
    )
  );
  if (result.status !== 0)
    throw new Error(`${log} failed (exit ${result.status}, ${result.error?.code || ''})`);
  return Date.now() - start;
}
async function snapshot(url: string) {
  const p = new PrismaClient({ datasources: { db: { url } } });
  try {
    return await p.$transaction(
      async (tx) => {
        await tx.$executeRawUnsafe('SET TRANSACTION READ ONLY');
        const tables = await tx.$queryRawUnsafe<Array<{ tablename: string }>>(
          `SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename`
        );
        const rows: Record<string, unknown> = {};
        for (const { tablename } of tables) {
          const quoted = `"${tablename.replace(/"/g, '""')}"`;
          const result = await tx.$queryRawUnsafe(`SELECT count(*)::int AS count FROM ${quoted}`);
          rows[tablename] = result;
        }
        const money: Record<string, unknown> = {};
        for (const [table, column] of [
          ['debts', 'originalAmount'],
          ['payments', 'totalAmount'],
          ['sales_orders', 'totalAmount'],
          ['supplier_transactions', 'amount'],
        ]) {
          const exists = await tx.$queryRawUnsafe<Array<{ n: number }>>(
            `SELECT count(*)::int n FROM information_schema.columns WHERE table_schema='public' AND table_name='${table}' AND column_name='${column}'`
          );
          if (exists[0].n)
            money[`${table}.${column}`] = await tx.$queryRawUnsafe(
              `SELECT COALESCE(SUM("${column}"),0)::text total FROM "${table}"`
            );
        }
        const originals = await tx.$queryRawUnsafe(
          `SELECT md5(COALESCE(string_agg(row_to_json(t)::text, '' ORDER BY t.id),'')) hash FROM (SELECT id,"customerId","totalAmount","paymentDate","voidedAt" FROM payments) t`
        );
        return { counts: rows, money, originalPaymentHash: originals };
      },
      { isolationLevel: 'RepeatableRead', timeout: 60000 }
    );
  } finally {
    await p.$disconnect();
  }
}
async function main() {
  const names = Object.fromEntries(
    ['ci', 'browser', 'restored'].map((kind) => [
      kind,
      `hc_audit_test_${kind}${kind === 'ci' ? '_phase4_phase5_phase6' : ''}_${stamp}`,
    ])
  );
  const admin = new PrismaClient({ datasources: { db: { url: urlFor('postgres') } } });
  try {
    for (const name of Object.values(names)) {
      if (
        !/^hc_audit_test_[a-z]+(?:_phase4_phase5_phase6)?_\d{14}$/.test(name) ||
        name === source.pathname.slice(1)
      )
        throw new Error('Unsafe target');
      // CREATE without IF NOT EXISTS deliberately fails if a database already exists.
      await admin.$executeRawUnsafe(`CREATE DATABASE "${name}"`);
    }
  } finally {
    await admin.$disconnect();
  }
  const secrets = {
    JWT_SECRET: crypto.randomBytes(48).toString('base64'),
    JWT_REFRESH_SECRET: crypto.randomBytes(48).toString('base64'),
  };
  fs.writeFileSync(
    path.join(runtime, 'databases.json'),
    JSON.stringify(
      {
        names,
        urls: Object.fromEntries(Object.entries(names).map(([k, v]) => [k, urlFor(v)])),
        ...secrets,
      },
      null,
      2
    )
  );
  const fresh: Record<string, unknown> = {};
  for (const kind of ['ci', 'browser']) {
    const durationMs = run(
      process.execPath,
      [
        'node_modules/prisma/build/index.js',
        'migrate',
        'deploy',
        '--schema',
        'backend/prisma/schema.prisma',
      ],
      { ...process.env, DATABASE_URL: urlFor(names[kind]) },
      `migrate-${kind}.log`
    );
    fresh[kind] = { database: names[kind], durationMs };
  }
  save('fresh-migrations.json', fresh);
  const before = await snapshot(source.toString());
  save('source-before.json', before);
  const archive = path.join(runtime, `business-${stamp}.backup`);
  const pgEnv = { ...process.env, PGPASSWORD: decodeURIComponent(source.password) };
  const pgArgs = [
    '--host',
    source.hostname,
    '--port',
    source.port || '5432',
    '--username',
    decodeURIComponent(source.username),
  ];
  const dumpMs = run(
    path.join(pgBin, 'pg_dump.exe'),
    [
      ...pgArgs,
      '--format=custom',
      '--no-owner',
      '--no-acl',
      '--file',
      archive,
      source.pathname.slice(1),
    ],
    pgEnv,
    'backup.log'
  );
  const readableMs = run(
    path.join(pgBin, 'pg_restore.exe'),
    ['--list', archive],
    pgEnv,
    'backup-readability.log'
  );
  const restoreMs = run(
    path.join(pgBin, 'pg_restore.exe'),
    [...pgArgs, '--no-owner', '--no-acl', '--exit-on-error', '--dbname', names.restored, archive],
    pgEnv,
    'restore.log'
  );
  save('restored-before.json', await snapshot(urlFor(names.restored)));
  const p = new PrismaClient({ datasources: { db: { url: urlFor(names.restored) } } });
  let migrationClean = false;
  try {
    const start = Date.now();
    const results = await MigrationExecutor.applyPending(p as unknown as MigrationClient);
    const status = await MigrationExecutor.status(p as unknown as MigrationClient);
    save('restored-migrations.json', {
      database: names.restored,
      durationMs: Date.now() - start,
      results,
      status,
    });
    migrationClean = !status.failed.length && !status.pending.length && !status.mismatched.length;
  } finally {
    await p.$disconnect();
  }
  save('restored-after.json', await snapshot(urlFor(names.restored)));
  const after = await snapshot(source.toString());
  save('source-after.json', after);
  save('backup-restore.json', {
    timestamp: new Date().toISOString(),
    sourceDatabase: source.pathname.slice(1),
    restoredDatabase: names.restored,
    archiveBytes: fs.statSync(archive).size,
    sha256: crypto.createHash('sha256').update(fs.readFileSync(archive)).digest('hex'),
    dumpMs,
    readableMs,
    restoreMs,
    sourceUnchanged: JSON.stringify(before) === JSON.stringify(after),
  });
  console.log(
    JSON.stringify({
      fresh,
      restored: names.restored,
      dumpMs,
      restoreMs,
      migrationClean,
      sourceUnchanged: JSON.stringify(before) === JSON.stringify(after),
    })
  );
  if (!migrationClean) process.exitCode = 1;
}
main().catch((e) => {
  console.error(e.message?.replace(/postgres(?:ql)?:\/\/\S+/g, '[REDACTED]'));
  process.exitCode = 1;
});
