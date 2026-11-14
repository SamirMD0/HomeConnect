import fs from 'node:fs';
import path from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';

const root = path.resolve('backend/src');
const relay = path.join(root, 'relay');
const imports = (source: string) => [...source.matchAll(/\b(?:from\s*|import\s*\(|require\s*\()\s*['"]([^'"]+)['"]/g)].map(match => match[1]);
let sources: Array<{ file: string; source: string; dependencies: string[] }>;
let sql: string;
let schema: string;
let reviewSql: string;

describe('relay isolation and additive schema', () => {
  beforeAll(async () => {
    const files = (await fs.promises.readdir(root, { recursive: true })).map(String)
      .filter(file => file.endsWith('.ts') && !file.endsWith('.test.ts'));
    sources = await Promise.all(files.map(async file => {
      const source = await fs.promises.readFile(path.join(root, file), 'utf8');
      return { file, source, dependencies: imports(source) };
    }));
    [sql, schema, reviewSql] = await Promise.all([
      fs.promises.readFile('backend/prisma/relay/migrations/20261115090000_relay_foundation/migration.sql', 'utf8'),
      fs.promises.readFile('backend/prisma/relay/schema.prisma', 'utf8'),
      fs.promises.readFile('backend/prisma/relay/migrations/20261115100000_relay_review_fixes/migration.sql', 'utf8'),
    ]);
  }, 60000);

  it('keeps runtime imports within the relay and its own generated client', () => {
    for (const { file, source, dependencies } of sources.filter(entry => entry.file.startsWith('relay' + path.sep))) {
      expect(source).not.toMatch(/(?<!RELAY_)DATABASE_URL/);
      for (const dependency of dependencies) {
        expect(dependency).not.toBe('@prisma/client');
        if (dependency.startsWith('.')) {
          if (dependency === '.prisma/relay-client') continue;
          expect(path.resolve(root, path.dirname(file), dependency).startsWith(relay + path.sep)).toBe(true);
        }
        expect(dependency).not.toMatch(/^@backend\//);
      }
    }
  });

  it('keeps PC runtime imports outside the relay', () => {
    for (const { file, dependencies } of sources.filter(entry => !entry.file.startsWith('relay' + path.sep))) {
      for (const dependency of dependencies) {
        expect(dependency).not.toMatch(/^@backend\/relay(?:\/|$)/);
        if (dependency.startsWith('.')) {
          const resolved = path.resolve(root, path.dirname(file), dependency);
          expect(resolved === relay || resolved.startsWith(relay + path.sep)).toBe(false);
        }
      }
    }
  });

  it('installs the separate tables, increasing revision trigger, and transport constraints', () => {
    for (const table of ['devices', 'records', 'outbox', 'blobs', 'usage', 'worker']) expect(sql).toContain('CREATE TABLE relay_' + table);
    expect(sql).toContain("NEW.rev := nextval('relay_record_rev_seq')");
    expect(sql).toContain('size BETWEEN 1 AND 2097152');
    expect(sql).toContain('ON DELETE CASCADE');
    expect(sql).not.toMatch(/\b(?:DROP|TRUNCATE|ALTER TABLE)\b/i);
    expect(schema).toContain('env("RELAY_DATABASE_URL")');
    expect(schema).toContain('output   = "../../../node_modules/.prisma/relay-client"');
  });

  it('adds review metadata and widens the status check without removing stored data', () => {
    expect(reviewSql).toContain('ADD COLUMN previous_branch_ids UUID[] NOT NULL DEFAULT');
    expect(reviewSql).toContain('ADD COLUMN pruned_through_rev BIGINT NOT NULL DEFAULT 0');
    expect(reviewSql).toContain("'awaiting_photo'");
    expect(reviewSql).toContain('CREATE OR REPLACE FUNCTION relay_assign_record_rev()');
    expect(reviewSql).not.toMatch(/\b(?:DROP\s+(?:TABLE|COLUMN)|TRUNCATE|DELETE FROM)\b/i);
  });
});
