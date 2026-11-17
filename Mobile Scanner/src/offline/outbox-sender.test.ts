import { describe, expect, it, vi } from 'vitest';
import { memoryDb } from './testing/memory-db';
import {
  saveAction,
  listOutbox,
  actionMessage,
  FAILED_MESSAGE,
  type PhotoFiles,
  type ActionType,
} from './outbox';
import { OutboxSender, RelayRequestError } from './outbox-sender';
const files: PhotoFiles = {
  copy: vi.fn(async () => ({ path: 'document/photo', size: 5 })),
  read: vi.fn(async () => new Blob(['photo'])),
  remove: vi.fn(async () => {}),
};
const input = {
  owner: 'device:user',
  submissionKey: 'draft',
  type: 'sales_order.create' as ActionType,
  branchId: 'branch',
  summary: 'Order · Rami',
  payload: { items: [{ productId: 'p' }], idempotencyKey: 'draft' },
};
describe('cloud outbox sender using real SQLite and a fake relay', () => {
  it('recovers a lost blob response after the PC has already claimed it', async () => {
    const db = await memoryDb();
    await saveAction(
      db,
      { ...input, type: 'supplier_bill.upload', photo: { uri: 'cache', mime: 'image/jpeg' } },
      { uuid: () => 'photo', files }
    );
    let now = 10000;
    let uploaded = false;
    const put = vi.fn();
    const request = vi.fn(async (path: string, init?: RequestInit) => {
      if (init?.method === 'POST') return { status: 'awaiting_photo' };
      if (init?.method === 'PUT') {
        uploaded = true;
        put();
        throw Error('Response lost after upload');
      }
      return [{ id: 'photo', status: uploaded ? 'claimed' : 'awaiting_photo' }];
    });
    const sender = new OutboxSender(db, input.owner, request, { files, now: () => new Date(now) });
    await sender.sync();
    now += 2000;
    await sender.sync();
    expect(put).toHaveBeenCalledOnce();
    expect((await listOutbox(db))[0]?.local_status).toBe('claimed');
  });
  it('sends later bill pages only after the first page is applied', async () => {
    const db = await memoryDb();
    await saveAction(
      db,
      {
        ...input,
        type: 'supplier_bill.upload',
        payload: { supplierId: 's' },
        photo: { uri: 'cache', mime: 'image/jpeg' },
      },
      { uuid: () => 'lead', files }
    );
    await saveAction(
      db,
      {
        ...input,
        submissionKey: 'page2',
        type: 'supplier_bill.upload',
        payload: { supplierId: 's', billGroupId: 'lead' },
        photo: { uri: 'cache2', mime: 'image/jpeg' },
      },
      { uuid: () => 'page2', files }
    );
    let leadApplied = false;
    const sent: string[] = [];
    const request = async (path: string, init?: RequestInit) => {
      if (init?.method === 'POST') {
        sent.push(JSON.parse(String(init.body)).id);
        return { status: 'awaiting_photo' };
      }
      if (init?.method === 'PUT') return {};
      return [
        {
          id: 'lead',
          status: leadApplied ? 'applied' : 'pending',
          result: leadApplied ? { id: 'lead' } : null,
        },
      ];
    };
    const sender = new OutboxSender(db, input.owner, request, { files });
    await sender.sync();
    expect(sent).toEqual(['lead']);
    leadApplied = true;
    await sender.sync();
    await sender.sync();
    expect(sent).toEqual(['lead', 'page2']);
  });
  it('doubles network backoff without blocking local Save', async () => {
    const db = await memoryDb();
    await saveAction(db, input, { uuid: () => 'action' });
    let now = 10000;
    const offline = vi.fn(async () => {
      throw Error('offline');
    });
    const sender = new OutboxSender(db, input.owner, offline, { now: () => new Date(now) });
    await sender.sync();
    expect((await listOutbox(db))[0]?.next_attempt_at).toBe(12000);
    now = 12000;
    await sender.sync();
    expect((await listOutbox(db))[0]?.next_attempt_at).toBe(16000);
    now = 15000;
    await sender.sync();
    expect(offline).toHaveBeenCalledTimes(2);
  });
  it('sends only durable actions, with the same ID after a lost response and a process restart', async () => {
    const db = await memoryDb();
    await saveAction(db, input, { uuid: () => 'stable' });
    let now = 10000;
    const bodies: any[] = [];
    const request = vi.fn(async (path: string, init?: RequestInit) => {
      expect((await listOutbox(db))[0]?.id).toBe('stable');
      if (path === '/actions') {
        bodies.push(JSON.parse(String(init?.body)));
        if (bodies.length === 1) throw Error('response lost');
        return { status: 'pending' };
      }
      return [{ id: 'stable', status: 'claimed', result: null }];
    });
    await new OutboxSender(db, input.owner, request, { now: () => new Date(now) }).sync();
    await new OutboxSender(db, input.owner, request, { now: () => new Date(now) }).sync();
    expect(bodies).toHaveLength(1);
    now += 2000;
    await new OutboxSender(db, input.owner, request, { now: () => new Date(now) }).sync();
    expect(bodies).toHaveLength(2);
    expect(bodies[0]).toEqual(bodies[1]);
    expect(bodies[0]).toEqual({
      id: 'stable',
      type: 'sales_order.create',
      branchId: 'branch',
      payload: { items: [{ productId: 'p' }], idempotencyKey: 'stable' },
      createdAt: expect.any(String),
    });
  });
  it('declares photos before upload, retains files while pending and deletes only on the PC result', async () => {
    const db = await memoryDb();
    await saveAction(
      db,
      {
        ...input,
        type: 'supplier_bill.upload',
        payload: { supplierId: 's', note: 'bill' },
        photo: { uri: 'camera', mime: 'image/jpeg' },
      },
      { uuid: () => 'bill', files }
    );
    let status = 'awaiting_photo';
    const calls: string[] = [];
    const request = vi.fn(async (path: string, init?: RequestInit) => {
      calls.push(`${init?.method ?? 'GET'} ${path}`);
      if (init?.method === 'POST') {
        expect(JSON.parse(String(init.body))).toMatchObject({
          photo: { mime: 'image/jpeg', size: 5 },
          payload: { supplierId: 's', note: 'bill' },
        });
        return { status };
      }
      if (init?.method === 'PUT') {
        status = 'pending';
        return { id: 'bill', size: 5 };
      }
      return [{ id: 'bill', status, result: status === 'applied' ? { id: 'receipt' } : null }];
    });
    const applied = vi.fn(),
      sender = new OutboxSender(db, input.owner, request, { files, onApplied: applied });
    await sender.sync();
    expect(calls.slice(0, 2)).toEqual(['POST /actions', 'PUT /actions/bill/blob']);
    expect((await listOutbox(db))[0]?.photo_path).toBe('document/photo');
    status = 'awaiting_photo';
    await sender.sync();
    expect(calls.filter((call) => call.startsWith('PUT'))).toHaveLength(2);
    status = 'applied';
    await sender.sync();
    expect(applied).toHaveBeenCalledOnce();
    expect((await listOutbox(db))[0]?.photo_path).toBeNull();
  });
  it.each(['applied', 'refused', 'failed'] as const)(
    'keeps authoritative %s results and messages',
    async (status) => {
      const db = await memoryDb();
      await saveAction(db, input, { uuid: () => 'action' });
      const sender = new OutboxSender(db, input.owner, async (path) =>
        path === '/actions'
          ? { status: 'pending' }
          : [{ id: 'action', status, result: { message: 'Only 2 left in stock' } }]
      );
      await sender.sync();
      const [row] = await listOutbox(db);
      expect(row?.local_status).toBe(status);
      expect(actionMessage(row!)).toBe(
        status === 'applied'
          ? 'Done'
          : status === 'failed'
            ? FAILED_MESSAGE
            : 'Only 2 left in stock'
      );
    }
  );
  it('single-flights separate senders and never retries an ACTION_ID_CONFLICT', async () => {
    const db = await memoryDb();
    await saveAction(db, input, { uuid: () => 'action' });
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const request = vi.fn(async () => {
      await gate;
      throw new RelayRequestError(409, 'ACTION_ID_CONFLICT');
    });
    const first = new OutboxSender(db, input.owner, request).sync(),
      second = new OutboxSender(db, input.owner, request).sync();
    expect(first).toBe(second);
    release();
    await first;
    await new OutboxSender(db, input.owner, request).sync();
    expect(request).toHaveBeenCalledOnce();
    expect((await listOutbox(db))[0]?.last_error).toContain('conflicts');
  });
  it('propagates 401 so the engine wipes the session, and never sends another owner’s archived work', async () => {
    const db = await memoryDb();
    await saveAction(db, input, { uuid: () => 'action' });
    const request = vi.fn(async () => {
      throw new RelayRequestError(401, 'DEVICE_REVOKED');
    });
    await expect(new OutboxSender(db, input.owner, request).sync()).rejects.toMatchObject({
      status: 401,
    });
    const other = vi.fn();
    await new OutboxSender(db, 'another:user', other).sync();
    expect(other).not.toHaveBeenCalled();
  });
});
