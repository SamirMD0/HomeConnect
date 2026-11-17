import { secretStorage, type SecretStorage } from './storage';
import type { OutboxRow } from '../offline/outbox';
export interface SavedSummary {
  id: string;
  type: OutboxRow['type'];
  summary: string;
  created_at: string;
}
const INDEX = 'homeconnect.unsent.index.v1';
const pageKey = (generation: string, index: number) => `homeconnect.unsent.${generation}.${index}`;
export class SummaryArchive {
  private queue: Promise<unknown> = Promise.resolve();
  constructor(
    private storage: SecretStorage,
    private uuid: () => Promise<string>
  ) {}
  async list(): Promise<SavedSummary[]> {
    const raw = await this.storage.get(INDEX);
    if (!raw) return [];
    const index = JSON.parse(raw) as { generation: string; pages: number };
    if (
      !/^[a-zA-Z0-9-]+$/.test(index.generation) ||
      !Number.isSafeInteger(index.pages) ||
      index.pages < 0
    )
      throw new Error('Saved action summaries could not be read. Nothing has been removed.');
    const result: SavedSummary[] = [];
    for (let page = 0; page < index.pages; page++) {
      const value = await this.storage.get(pageKey(index.generation, page));
      if (value === null)
        throw new Error('Saved action summaries could not be read. Nothing has been removed.');
      result.push(...JSON.parse(value));
    }
    return result;
  }
  private serial<T>(work: () => Promise<T>) {
    const next = this.queue.then(work);
    this.queue = next.catch(() => {});
    return next;
  }
  private async replace(rows: SavedSummary[]) {
    const old = await this.storage.get(INDEX);
    const generation = await this.uuid();
    const chunks: string[] = [];
    let current: SavedSummary[] = [];
    for (const row of rows) {
      const next = [...current, row];
      if (JSON.stringify(next).length * 3 > 1600 && current.length) {
        chunks.push(JSON.stringify(current));
        current = [row];
      } else current = next;
    }
    if (current.length) chunks.push(JSON.stringify(current));
    for (let page = 0; page < chunks.length; page++) {
      const key = pageKey(generation, page);
      await this.storage.set(key, chunks[page]!);
      if ((await this.storage.get(key)) !== chunks[page])
        throw new Error('Could not verify saved action summaries. Nothing has been removed.');
    }
    const manifest = JSON.stringify({ generation, pages: chunks.length });
    await this.storage.set(INDEX, manifest);
    if ((await this.storage.get(INDEX)) !== manifest)
      throw new Error('Could not verify saved action summaries. Nothing has been removed.');
    if (old) {
      const previous = JSON.parse(old);
      for (let page = 0; page < previous.pages; page++)
        await this.storage.remove(pageKey(previous.generation, page)).catch(() => {});
    }
  }
  save(
    rows: Pick<OutboxRow, 'id' | 'type' | 'summary' | 'created_at' | 'local_status' | 'dismissed'>[]
  ) {
    return this.serial(async () => {
      const existing = await this.list(),
        byId = new Map(existing.map((row) => [row.id, row]));
      for (const row of rows)
        if (row.local_status !== 'applied' && !row.dismissed)
          byId.set(row.id, {
            id: row.id,
            type: row.type,
            summary: row.summary,
            created_at: row.created_at,
          });
      await this.replace([...byId.values()]);
    });
  }
  dismiss(id: string) {
    return this.serial(async () =>
      this.replace((await this.list()).filter((row) => row.id !== id))
    );
  }
}
export const summaryArchive = new SummaryArchive(secretStorage, async () =>
  (await import('expo-crypto')).randomUUID()
);
export function archivedRow(row: SavedSummary): OutboxRow {
  return {
    ...row,
    owner: '',
    submission_key: '',
    branch_id: '',
    payload: '{}',
    photo_path: null,
    photo_mime: null,
    photo_size: null,
    local_status: 'failed',
    result: null,
    updated_at: row.created_at,
    attempts: 0,
    last_error: 'Not sent: this phone was removed by the shop',
    next_attempt_at: 0,
    archived: 2,
    dismissed: 0,
  };
}
