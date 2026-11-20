import { beforeEach, describe, it, expect, vi } from 'vitest';
const mock = vi.hoisted(() => ({
  files: new Set<string>(),
  secrets: new Map<string, string>(),
  order: [] as string[],
  archiveFails: false,
  native: { execAsync: vi.fn(), runAsync: vi.fn(), getAllAsync: vi.fn(), closeAsync: vi.fn() },
}));
vi.mock('expo-sqlite', () => ({
  // Real Android value: a plain path, not a file:// URI.
  defaultDatabaseDirectory: '/data/user/0/com.homeconnect.mobilescanner/files/SQLite',
  openDatabaseAsync: vi.fn(async () => mock.native),
  deleteDatabaseAsync: vi.fn(async (name: string) => {
    mock.order.push(`delete:${name}`);
    mock.files.delete(name);
  }),
}));
vi.mock('expo-file-system/legacy', () => ({
  documentDirectory: 'file://documents/',
  cacheDirectory: 'file://cache/',
  // Like the native legacy API: plain paths are rejected, only file:// URIs work.
  getInfoAsync: async (path: string) => {
    if (!path.startsWith('file://')) throw new Error(`Location '${path}' isn't readable.`);
    return { exists: mock.files.has(path.split('/').at(-1)!) };
  },
  deleteAsync: vi.fn(async (path: string) => {
    if (!path.startsWith('file://')) throw new Error(`Location '${path}' isn't deletable.`);
  }),
  readDirectoryAsync: async () => [],
}));
vi.mock('expo-crypto', () => ({ getRandomBytes: (n: number) => new Uint8Array(n).fill(7) }));
vi.mock('../security/storage', () => ({
  DB_KEY: 'db-key',
  PIN_KEY: 'pin-key',
  secretStorage: {
    get: async (key: string) => mock.secrets.get(key) ?? null,
    set: async (key: string, value: string) => {
      mock.secrets.set(key, value);
    },
    remove: async (key: string) => {
      mock.order.push(`remove:${key}`);
      mock.secrets.delete(key);
    },
  },
}));
vi.mock('../security/summary-archive', () => ({
  summaryArchive: {
    save: vi.fn(async (rows: unknown[]) => {
      mock.order.push('archive');
      if (mock.archiveFails) throw Error('storage full');
      expect(rows).toEqual([{ id: 'unsent', summary: 'Order · Customer' }]);
    }),
  },
}));
// Migration logic is exercised separately against real SQLite; these tests check native/key boundaries.
vi.mock('./encrypted-migration', () => ({
  CIPHER_DB: 'cipher.db',
  PLAIN_DB: 'plain.db',
  migratePlainDb: vi.fn(),
}));
beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  mock.files = new Set(['cipher.db']);
  mock.secrets = new Map([
    ['db-key', 'ab'.repeat(32)],
    ['pin-key', 'hash-only'],
  ]);
  mock.order = [];
  mock.archiveFails = false;
  mock.native.getAllAsync.mockImplementation(async (sql: string) =>
    sql === 'PRAGMA cipher_version'
      ? [{ cipher_version: '4.6' }]
      : sql === 'SELECT * FROM outbox'
        ? [{ id: 'unsent', summary: 'Order · Customer' }]
        : []
  );
});
describe('keyed native database', () => {
  it('fails closed when the native binary has no SQLCipher support', async () => {
    const { verifyCipher } = await import('./expo-db');
    mock.native.getAllAsync.mockResolvedValue([]);
    await expect(verifyCipher(mock.native, 'ab'.repeat(32))).rejects.toThrow('native build');
    expect(mock.native.execAsync).not.toHaveBeenCalled();
  });
  it('uses the same keyed connection and serializes other work outside the transaction', async () => {
    const { serialDatabase } = await import('./expo-db');
    const db = serialDatabase(mock.native);
    const tx = db.transaction(async (tx) => {
      await tx.exec('inside one');
      await tx.query('inside two');
    });
    const outside = db.exec('outside');
    await Promise.all([tx, outside]);
    expect(mock.native.execAsync.mock.calls.map((call) => call[0])).toEqual([
      'BEGIN IMMEDIATE',
      'inside one',
      'COMMIT',
      'outside',
    ]);
    expect(mock.native.getAllAsync).toHaveBeenCalledWith('inside two', []);
  });
  it('archives unsent summaries before deleting the database and its key on wipe', async () => {
    const { deleteLocalDb } = await import('./expo-db');
    await deleteLocalDb();
    expect(mock.order).toEqual(['archive', 'delete:cipher.db', 'remove:db-key', 'remove:pin-key']);
    expect(mock.native.closeAsync).toHaveBeenCalledOnce();
    expect(mock.secrets.size).toBe(0);
  });
  it('retains the encrypted file and key if summary preservation fails', async () => {
    const { deleteLocalDb } = await import('./expo-db');
    mock.archiveFails = true;
    await expect(deleteLocalDb()).rejects.toThrow('storage full');
    expect(mock.order).toEqual(['archive']);
    expect(mock.files.has('cipher.db')).toBe(true);
    expect(mock.secrets.has('db-key')).toBe(true);
  });
  it('the tenth wrong PIN invokes the real archive-before-delete wipe', async () => {
    const { deleteLocalDb } = await import('./expo-db');
    const { PinController, pinWait, TOO_MANY_PINS } = await import('../security/pin-controller');
    const { secretStorage } = await import('../security/storage');
    let now = 1000;
    const wipe = vi.fn(async (message: string) => {
      expect(message).toBe(TOO_MANY_PINS);
      await deleteLocalDb();
    });
    const controller = new PinController('device:user', {
      storage: secretStorage,
      random: async () => 'c'.repeat(32),
      derive: async (pin) => (pin === '1234' ? 'a'.repeat(64) : 'b'.repeat(64)),
      now: () => now,
      biometric: async () => false,
      wipe,
    });
    mock.secrets.delete('pin-key');
    await controller.load();
    await controller.setup('1234', '1234');
    controller.lock();
    for (let count = 1; count <= 10; count++) {
      await controller.unlockPin('9999');
      now += pinWait(count);
    }
    expect(wipe).toHaveBeenCalledOnce();
    expect(mock.order).toEqual(['archive', 'delete:cipher.db', 'remove:db-key', 'remove:pin-key']);
    expect(mock.secrets.size).toBe(0);
  });
  it('never replaces a lost key for an existing encrypted database', async () => {
    const { openLocalDb } = await import('./expo-db');
    mock.secrets.delete('db-key');
    await expect(openLocalDb()).rejects.toThrow('key is missing');
    expect(mock.secrets.has('db-key')).toBe(false);
  });
  it('turns the plain Android database folder into file:// URIs', async () => {
    const { databaseFileUri } = await import('./expo-db');
    expect(databaseFileUri('/data/user/0/app/files/SQLite', 'a.db')).toBe('file:///data/user/0/app/files/SQLite/a.db');
    expect(databaseFileUri('/data/user/0/app/files/SQLite/', 'a.db-wal')).toBe('file:///data/user/0/app/files/SQLite/a.db-wal');
    expect(databaseFileUri('file:///data/x/SQLite', 'a.db')).toBe('file:///data/x/SQLite/a.db');
  });
  it('deletes the database sidecar files by file:// URI (first cloud pairing on Android)', async () => {
    const fs = await import('expo-file-system/legacy');
    const { deleteLocalDb } = await import('./expo-db');
    mock.files.clear();
    await deleteLocalDb();
    const deleted = vi.mocked(fs.deleteAsync).mock.calls.map(([path]) => path);
    expect(deleted.filter((path) => path.includes('/SQLite/')).length).toBeGreaterThanOrEqual(3);
    expect(deleted.every((path) => path.startsWith('file://'))).toBe(true);
  });
  it('can wipe a never-opened or already-deleted database without native missing-file errors', async () => {
    const { deleteLocalDb } = await import('./expo-db');
    mock.files.clear();
    await deleteLocalDb();
    expect(mock.order).toEqual(['remove:db-key', 'remove:pin-key']);
  });
});
