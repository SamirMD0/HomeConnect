import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const root = path.resolve('backend/src');
const relay = path.join(root, 'relay');
const sources = fs.readdirSync(root, { recursive: true }).map(String).filter(file => file.endsWith('.ts') && !file.endsWith('.test.ts'));
const imports = (source: string) => [...source.matchAll(/\b(?:from\s*|import\s*\(|require\s*\()\s*['"]([^'"]+)['"]/g)].map(match => match[1]);

describe('relay isolation and additive schema', () => {
  it('keeps runtime imports within the relay and its own generated client', () => {
    for (const file of sources.filter(file => file.startsWith('relay' + path.sep))) {
      const source = fs.readFileSync(path.join(root, file), 'utf8');
      expect(source).not.toMatch(/(?<!RELAY_)DATABASE_URL/);
      for (const dependency of imports(source)) {
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
    for (const file of sources.filter(file => !file.startsWith('relay' + path.sep))) {
      const source = fs.readFileSync(path.join(root, file), 'utf8');
      for (const dependency of imports(source)) {
        expect(dependency).not.toMatch(/^@backend\/relay(?:\/|$)/);
        if (dependency.startsWith('.')) {
          const resolved = path.resolve(root, path.dirname(file), dependency);
          expect(resolved === relay || resolved.startsWith(relay + path.sep)).toBe(false);
        }
      }
    }
  });

  it('installs the separate tables, increasing revision trigger, and transport constraints', () => {
    const sql = fs.readFileSync('backend/prisma/relay/migrations/20261115090000_relay_foundation/migration.sql', 'utf8');
    for (const table of ['devices', 'records', 'outbox', 'blobs', 'usage', 'worker']) expect(sql).toContain('CREATE TABLE relay_' + table);
    expect(sql).toContain("NEW.rev := nextval('relay_record_rev_seq')");
    expect(sql).toContain('size BETWEEN 1 AND 2097152');
    expect(sql).toContain('ON DELETE CASCADE');
    expect(sql).not.toMatch(/\b(?:DROP|TRUNCATE|ALTER TABLE)\b/i);
    const schema = fs.readFileSync('backend/prisma/relay/schema.prisma', 'utf8');
    expect(schema).toContain('env("RELAY_DATABASE_URL")');
    expect(schema).toContain('output   = "../../../node_modules/.prisma/relay-client"');
  });
});
