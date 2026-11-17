import { describe, expect, it } from 'vitest';
import { SummaryArchive } from './summary-archive';
import type { SecretStorage } from './storage';
const row = (id: string) => ({
  id,
  type: 'sales_order.create' as const,
  summary: `Order · Rami ${id}`,
  created_at: '2026-11-17T10:00:00Z',
  local_status: 'queued' as const,
  dismissed: 0,
  payload: 'PRIVATE_MONEY_PAYLOAD',
  photo_path: 'private-photo',
});
describe('retained encrypted summaries', () => {
  it('keeps only summaries and atomically replaces a paged SecureStore archive', async () => {
    const values = new Map<string, string>();
    let id = 0;
    const storage: SecretStorage = {
      get: async (key) => values.get(key) ?? null,
      set: async (key, value) => {
        values.set(key, value);
      },
      remove: async (key) => {
        values.delete(key);
      },
    };
    const archive = new SummaryArchive(storage, async () => `generation-${++id}`);
    await archive.save(Array.from({ length: 50 }, (_, i) => row(String(i))));
    expect(await archive.list()).toHaveLength(50);
    expect([...values.values()].join('')).not.toContain('PRIVATE');
    expect([...values.values()].join('')).not.toContain('private-photo');
    await archive.dismiss('1');
    expect(await archive.list()).toHaveLength(49);
  });
  it('does not lose the old archive if a new page write fails before its manifest', async () => {
    const values = new Map<string, string>();
    let fail = false,
      id = 0;
    const storage: SecretStorage = {
      get: async (key) => values.get(key) ?? null,
      set: async (key, value) => {
        if (fail && !key.includes('index')) throw Error('disk failure');
        values.set(key, value);
      },
      remove: async (key) => {
        values.delete(key);
      },
    };
    const archive = new SummaryArchive(storage, async () => `generation-${++id}`);
    await archive.save([row('old')]);
    fail = true;
    await expect(archive.save([row('new')])).rejects.toThrow();
    expect((await archive.list()).map((row) => row.id)).toEqual(['old']);
  });
});
