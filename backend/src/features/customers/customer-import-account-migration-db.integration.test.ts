import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';
import { isIsolatedTestDatabase } from '../../test/database';
import {
  classifyPresence,
  expectedObjects,
  readSchemaObjects,
} from '../maintenance/migration-presence';

const migrationName = '20261029130000_add_customer_import_accounts';
const migrationPath = path.resolve('backend/prisma/migrations', migrationName, 'migration.sql');
const sql = fs.readFileSync(migrationPath, 'utf8');
const enabled =
  process.env.RUN_FINANCIAL_DB_TESTS === '1' && isIsolatedTestDatabase(process.env.DATABASE_URL);
describe('customer import account additive migration', () => {
  it('creates only additive objects and is detectable by the desktop migration presence classifier', () => {
    expect(sql).not.toMatch(/\b(DROP|RENAME|CONCURRENTLY)\b/i);
    expect(sql.trim()).toMatch(/^BEGIN;/);
    expect(sql.trim()).toMatch(/COMMIT;$/);
    expect(sql).toContain('RAISE EXCEPTION');
    expect(migrationName > '20261027120000_add_branch_ownership').toBe(true);
    expect(expectedObjects(sql)).toEqual(
      expect.arrayContaining([
        'index:customer_import_accounts_customerId_branchId_idx',
        'table:customer_import_accounts',
      ])
    );
  });
});
(enabled ? describe : describe.skip)(
  'customer import account migration on throwaway schema',
  () => {
    it('fails clearly without prerequisites, applies after develop migrations, and classifies PRESENT afterwards', async () => {
      if (!isIsolatedTestDatabase(process.env.DATABASE_URL))
        throw new Error('Isolated database required');
      const name = 'homeconnect_test_account_migration_' + randomUUID().replaceAll('-', '');
      const url = new URL(process.env.DATABASE_URL!);
      url.pathname = '/' + name;
      if (!isIsolatedTestDatabase(url.toString())) throw new Error('Unsafe scratch target');
      const admin = new PrismaClient();
      const scratch = new PrismaClient({ datasources: { db: { url: url.toString() } } });
      const temp = path.resolve('node_modules/.cache/home-connect', name);
      fs.mkdirSync(path.join(temp, 'migrations'), { recursive: true });
      fs.copyFileSync('backend/prisma/schema.prisma', path.join(temp, 'schema.prisma'));
      fs.copyFileSync(
        'backend/prisma/migrations/migration_lock.toml',
        path.join(temp, 'migrations/migration_lock.toml')
      );
      for (const entry of fs.readdirSync('backend/prisma/migrations', { withFileTypes: true }))
        if (entry.isDirectory() && entry.name < migrationName)
          fs.cpSync(
            path.join('backend/prisma/migrations', entry.name),
            path.join(temp, 'migrations', entry.name),
            { recursive: true }
          );
      const cli = (...args: string[]) =>
        execFileSync(
          process.execPath,
          [
            path.resolve('node_modules/prisma/build/index.js'),
            ...args,
            '--schema',
            path.join(temp, 'schema.prisma'),
          ],
          {
            env: { ...process.env, DATABASE_URL: url.toString() },
            encoding: 'utf8',
            windowsHide: true,
            timeout: 240000,
            stdio: 'pipe',
          }
        );
      try {
        await admin.$executeRawUnsafe('CREATE DATABASE "' + name + '"');
        expect(() => cli('db', 'execute', '--file', migrationPath)).toThrow(
          /Customer import accounts require the existing customer import/
        );
        cli('migrate', 'deploy');
        expect(
          classifyPresence(
            { name: migrationName, sql, checksum: 'test' },
            await readSchemaObjects(scratch)
          ).verdict
        ).toBe('MISSING');
        fs.cpSync(path.dirname(migrationPath), path.join(temp, 'migrations', migrationName), {
          recursive: true,
        });
        cli('migrate', 'deploy');
        expect(
          classifyPresence(
            { name: migrationName, sql, checksum: 'test' },
            await readSchemaObjects(scratch)
          ).verdict
        ).toBe('PRESENT');
        expect(await scratch.customerImport.count()).toBe(0);
        expect(() => cli('db', 'execute', '--file', migrationPath)).toThrow(
          /objects already exist/
        );
      } finally {
        await scratch.$disconnect();
        await admin.$executeRawUnsafe('DROP DATABASE IF EXISTS "' + name + '" WITH (FORCE)');
        await admin.$disconnect();
      }
    }, 540000);
  }
);
