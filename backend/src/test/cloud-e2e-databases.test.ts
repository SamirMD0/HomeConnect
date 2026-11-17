import { describe, it, expect } from 'vitest';
import { cloudE2eEnabled } from './cloud-e2e-databases';
describe('cloud e2e database safety', () => {
  it('skips without the explicit flag', () => expect(cloudE2eEnabled({})).toBe(false));
  it('refuses either unsafe or missing database before setup', () => {
    for (const [pc, relay] of [
      ['shop', 'relay_test'],
      ['pc_test', 'shop'],
      ['pc_test', ''],
      ['citadel', 'relay_test'],
    ])
      expect(() =>
        cloudE2eEnabled({
          RUN_CLOUD_E2E: '1',
          DATABASE_URL: `postgresql://localhost/${pc}`,
          RELAY_DATABASE_URL: relay ? `postgresql://localhost/${relay}` : undefined,
        })
      ).toThrow('BOTH');
  });
  it('accepts isolated PC and relay databases together', () =>
    expect(
      cloudE2eEnabled({
        RUN_CLOUD_E2E: '1',
        DATABASE_URL: 'postgresql://localhost/pc_test',
        RELAY_DATABASE_URL: 'postgresql://localhost/relay_ci',
      })
    ).toBe(true));
});
