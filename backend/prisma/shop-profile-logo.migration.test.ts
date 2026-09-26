import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = resolve(__dirname, '../..');
const migrationPath = resolve(__dirname, 'migrations/20260920100200_seed_shop_profile_logo/migration.sql');

describe('shop profile logo seed migration', () => {
  it('embeds the repository logo byte-for-byte and only fills an empty profile logo', () => {
    const sql = readFileSync(migrationPath, 'utf8');
    const encoded = sql.match(/decode\('([^']+)',\s*'base64'\)/)?.[1];

    expect(encoded).toBeTruthy();
    expect(Buffer.from(encoded!, 'base64')).toEqual(readFileSync(resolve(root, 'homeconnects-logo.webp')));
    expect(sql).toContain('"logoBytes" IS NULL');
    expect(sql).toContain("'4c2b1e9f-8c4b-4a2f-8a10-30c9a04c6d21'");
  });
});
