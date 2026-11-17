import type { LocalDb } from './local-db';
import {
  cleanOutbox,
  FAILED_MESSAGE,
  listOutbox,
  photoFiles,
  unfinished,
  type OutboxRow,
  type PhotoFiles,
  type ActionStatus,
} from './outbox';

export class RelayRequestError extends Error {
  constructor(
    readonly status: number,
    readonly code?: string
  ) {
    super('Relay request failed');
  }
}
export type RelayRequest = (path: string, init?: RequestInit) => Promise<any>;
const statuses = new Set<ActionStatus>([
  'awaiting_photo',
  'pending',
  'claimed',
  'applied',
  'refused',
  'failed',
]);
const flights = new WeakMap<LocalDb, Promise<boolean>>();
export class OutboxSender {
  constructor(
    private db: LocalDb,
    private owner: string,
    private request: RelayRequest,
    private options: { files?: PhotoFiles; now?: () => Date; onApplied?: () => void } = {}
  ) {}
  sync = (): Promise<boolean> => {
    const flight = flights.get(this.db);
    if (flight) return flight;
    const next = this.run().finally(() => flights.delete(this.db));
    flights.set(this.db, next);
    return next;
  };
  private now() {
    return (this.options.now ?? (() => new Date()))();
  }
  private async status(row: OutboxRow, status: ActionStatus, result?: unknown) {
    if (!statuses.has(status)) throw new Error('Invalid action status');
    await this.db.exec(
      'UPDATE outbox SET local_status=?,result=?,updated_at=?,attempts=0,next_attempt_at=0,last_error=? WHERE id=? AND archived=0',
      [
        status,
        result == null ? null : JSON.stringify(result),
        this.now().toISOString(),
        status === 'failed' ? FAILED_MESSAGE : null,
        row.id,
      ]
    );
    if (status === 'applied' && row.local_status !== 'applied') this.options.onApplied?.();
  }
  private async upload(row: OutboxRow) {
    if (!row.photo_path || !row.photo_mime)
      throw new Error('Photo is missing. Keep this action and check the shop PC.');
    const result = await this.request(`/actions/${encodeURIComponent(row.id)}/blob`, {
      method: 'PUT',
      headers: { 'Content-Type': row.photo_mime },
      body: await (this.options.files ?? photoFiles).read(row.photo_path),
    });
    await this.status(row, result.status ?? 'pending', result.result);
  }
  private async failedAttempt(row: OutboxRow, error: unknown) {
    if (error instanceof RelayRequestError && error.status === 401) throw error;
    if (
      error instanceof RelayRequestError &&
      error.status >= 400 &&
      error.status < 500 &&
      error.status !== 429 &&
      (error.status !== 409 || error.code === 'ACTION_ID_CONFLICT')
    ) {
      await this.db.exec(
        "UPDATE outbox SET local_status='failed',last_error=?,updated_at=? WHERE id=? AND archived=0",
        [
          error.code === 'ACTION_ID_CONFLICT'
            ? 'This action ID conflicts with another request. Check it on the shop PC; do not submit it again.'
            : 'The relay could not accept this action. Check it on the shop PC before trying again.',
          this.now().toISOString(),
          row.id,
        ]
      );
      return;
    }
    const attempts = row.attempts + 1;
    await this.db.exec(
      'UPDATE outbox SET attempts=?,next_attempt_at=?,last_error=? WHERE id=? AND archived=0',
      [
        attempts,
        this.now().getTime() + Math.min(1800000, 2000 * 2 ** Math.min(attempts - 1, 10)),
        'Not sent yet. Waiting for an internet connection.',
        row.id,
      ]
    );
  }
  private async run() {
    let applied = false;
    const rows = (await listOutbox(this.db, this.owner))
      .filter(
        (row) =>
          row.owner === this.owner &&
          !row.archived &&
          unfinished(row) &&
          row.next_attempt_at <= this.now().getTime()
      )
      .reverse();
    for (const row of rows) {
      try {
        if (row.local_status === 'queued') {
          const payload = JSON.parse(row.payload);
          if (row.type === 'supplier_bill.upload' && typeof payload.billGroupId === 'string') {
            const lead = (
              await this.db.query<{ local_status: string }>(
                'SELECT local_status FROM outbox WHERE id=?',
                [payload.billGroupId]
              )
            )[0];
            if (lead && lead.local_status !== 'applied') continue;
          }
          const body = await this.request('/actions', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              id: row.id,
              type: row.type,
              branchId: row.branch_id,
              payload,
              createdAt: row.created_at,
              ...(row.photo_path ? { photo: { mime: row.photo_mime, size: row.photo_size } } : {}),
            }),
          });
          // A successful replay may already be final; never replace it with pending.
          const status = body.status ?? body.action?.status ?? 'pending';
          await this.status(row, status, body.result ?? body.action?.result);
          if (status === 'applied') applied = true;
          if (status === 'awaiting_photo') await this.upload(row);
        }
      } catch (error) {
        await this.failedAttempt(row, error);
      }
    }
    const pending = (await listOutbox(this.db, this.owner)).filter(
      (row) =>
        row.owner === this.owner &&
        !row.archived &&
        ((unfinished(row) && row.local_status !== 'queued') ||
          (row.local_status === 'applied' && row.result === null)) &&
        row.next_attempt_at <= this.now().getTime()
    );
    for (let offset = 0; offset < pending.length; offset += 100) {
      const batch = pending.slice(offset, offset + 100);
      try {
        const body = await this.request(
          `/actions?ids=${batch.map((row) => encodeURIComponent(row.id)).join(',')}`
        );
        if (!Array.isArray(body)) throw new Error('Invalid action results');
        for (const remote of body) {
          const row = batch.find((item) => item.id === remote.id);
          if (!row || !statuses.has(remote.status)) continue;
          await this.status(row, remote.status, remote.result);
          if (remote.status === 'applied') applied = true;
          if (remote.status === 'awaiting_photo') {
            try {
              await this.upload(row);
            } catch (error) {
              await this.failedAttempt(row, error);
            }
          }
        }
      } catch (error) {
        for (const row of batch) await this.failedAttempt(row, error);
      }
    }
    await cleanOutbox(this.db, this.options.files ?? photoFiles, this.now());
    return applied;
  }
}
