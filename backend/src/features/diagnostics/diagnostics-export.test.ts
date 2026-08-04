import { describe, expect, it } from 'vitest';
import { assertNoSecretValues } from './diagnostics-export.service';
import { ZipEntry } from './zip-writer';

/**
 * The guard that matters. A diagnostics ZIP travels by email or chat, and a
 * leaked one cannot be recalled — so this fails closed rather than redacting
 * and hoping.
 */
describe('diagnostics export secret guard', () => {
  const withEnv = <T>(values: Record<string, string | undefined>, run: () => T): T => {
    const previous = { ...process.env };
    Object.assign(process.env, values);
    try { return run(); } finally { process.env = previous; }
  };

  const entries = (content: string): ZipEntry[] => [{ name: 'meta.json', content }];

  it('allows an ordinary archive through', () => {
    withEnv({ JWT_SECRET: 'super-secret-token-value' }, () => {
      expect(() => assertNoSecretValues(entries('{"appVersion":"1.2.0"}'))).not.toThrow();
    });
  });

  it('reports env vars by presence without tripping on their names', () => {
    withEnv({ JWT_SECRET: 'super-secret-token-value' }, () => {
      const summary = '{"variables":{"JWT_SECRET":"set","DATABASE_URL":"set"}}';
      expect(() => assertNoSecretValues(entries(summary))).not.toThrow();
    });
  });

  it('refuses to build when a JWT secret value appears', () => {
    withEnv({ JWT_SECRET: 'super-secret-token-value' }, () => {
      expect(() => assertNoSecretValues(entries('{"token":"super-secret-token-value"}'))).toThrow(/secret value/);
    });
  });

  it('refuses when the refresh secret appears', () => {
    withEnv({ JWT_REFRESH_SECRET: 'refresh-secret-value-here' }, () => {
      expect(() => assertNoSecretValues(entries('leaked refresh-secret-value-here'))).toThrow(/secret value/);
    });
  });

  it('refuses a connection string carrying credentials', () => {
    withEnv({ JWT_SECRET: undefined, JWT_REFRESH_SECRET: undefined, DATABASE_URL: undefined }, () => {
      expect(() => assertNoSecretValues(entries('postgresql://postgres:hunter2@localhost:5433/homeconnect')))
        .toThrow(/connection string/);
    });
  });

  it('allows a credential-free connection description', () => {
    withEnv({ JWT_SECRET: undefined, JWT_REFRESH_SECRET: undefined, DATABASE_URL: undefined }, () => {
      const safe = '{"database":{"host":"localhost","port":"5433","database":"homeconnect"}}';
      expect(() => assertNoSecretValues(entries(safe))).not.toThrow();
    });
  });

  it('refuses when the database password appears on its own', () => {
    withEnv({ DATABASE_URL: 'postgresql://postgres:hunter2xyz@localhost:5433/homeconnect' }, () => {
      expect(() => assertNoSecretValues(entries('{"note":"hunter2xyz"}'))).toThrow(/secret value/);
    });
  });

  /** A 2-character password would otherwise match ordinary prose. */
  it('ignores secrets too short to match meaningfully', () => {
    withEnv({ JWT_SECRET: 'ab' }, () => {
      expect(() => assertNoSecretValues(entries('a table of abbreviations'))).not.toThrow();
    });
  });

  it('scans every entry, not just the first', () => {
    withEnv({ JWT_SECRET: 'super-secret-token-value' }, () => {
      const many: ZipEntry[] = [
        { name: 'meta.json', content: '{}' },
        { name: 'errors.jsonl', content: 'super-secret-token-value' },
      ];
      expect(() => assertNoSecretValues(many)).toThrow(/secret value/);
    });
  });

  it('scans Buffer content as well as strings', () => {
    withEnv({ JWT_SECRET: 'super-secret-token-value' }, () => {
      expect(() => assertNoSecretValues([{ name: 'a.bin', content: Buffer.from('super-secret-token-value') }]))
        .toThrow(/secret value/);
    });
  });
});
