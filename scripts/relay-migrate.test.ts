import { describe, it, expect } from 'vitest';
import { migrationUrl } from './relay-migrate.mjs';
describe('click-only pooled Neon deployment', () => {
  it('uses the matching direct endpoint only for Prisma migrations, keeping TLS and credentials', () => {
    const result = new URL(
      migrationUrl(
        'postgresql://user:pass@ep-test-pooler.eu-central-1.aws.neon.tech/relay?sslmode=require&pgbouncer=true'
      )
    );
    expect(result.hostname).toBe('ep-test.eu-central-1.aws.neon.tech');
    expect(result.searchParams.get('sslmode')).toBe('require');
    expect(result.searchParams.has('pgbouncer')).toBe(false);
    expect(result.username).toBe('user');
    expect(result.password).toBe('pass');
  });
  it('leaves local and non-Neon connection settings intact', () => {
    const value = 'postgresql://user:pass@localhost:5433/relay_test?schema=public';
    expect(migrationUrl(value)).toBe(value);
  });
});
