import { describe, it, expect, vi } from 'vitest';
import type { LocalDb } from '../offline/local-db';
const state = vi.hoisted(() => ({
  db: null as LocalDb | null,
  files: new Map<string, string>(),
  write: vi.fn(),
}));
vi.mock('expo-file-system/legacy', () => ({
  documentDirectory: 'file://documents/',
  makeDirectoryAsync: vi.fn(),
  getInfoAsync: async (path: string) => ({ exists: state.files.has(path) }),
  readAsStringAsync: async (path: string) => state.files.get(path),
  writeAsStringAsync: async (path: string, value: string) => {
    state.write(path, value);
    state.files.set(path, value);
  },
  deleteAsync: vi.fn(),
}));
vi.mock('expo-crypto', () => ({
  CryptoDigestAlgorithm: { SHA256: 'sha256' },
  digestStringAsync: async (_algorithm: string, value: string) =>
    value.includes('cloud') ? 'c'.repeat(64) : 'a'.repeat(64),
  randomUUID: () => 'draft-id',
}));
vi.mock('../offline/expo-db', () => ({ openLocalDb: async () => state.db }));
import { memoryDb } from '../offline/testing/memory-db';
import { openDraft, forgetDraft, wipeCloudDrafts } from './draft-files';
describe('persisted sales drafts', () => {
  it('stores and recovers cloud drafts through the encrypted DB adapter, leaving LAN files unchanged', async () => {
    state.db = await memoryDb();
    const cloudScope = { server: 'cloud', userId: 'user', branchId: 'branch' };
    const cloud = await openDraft(cloudScope, 'order', '', true);
    expect(await state.db.query('SELECT name FROM cloud_drafts')).toEqual([
      { name: `${'c'.repeat(64)}.1.json` },
    ]);
    expect(state.write).not.toHaveBeenCalled();
    const key = cloud.current.idempotencyKey;
    await cloud.close();
    forgetDraft(cloudScope, 'order');
    const recovered = await openDraft(cloudScope, 'order', '', true);
    expect(recovered.current.idempotencyKey).toBe(key);
    expect(recovered.current.revision).toBe(1);
    await openDraft({ ...cloudScope, server: 'lan' }, 'order');
    expect(state.write).toHaveBeenCalledOnce();
    await wipeCloudDrafts();
  });
});
