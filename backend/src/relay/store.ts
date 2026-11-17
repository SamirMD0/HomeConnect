import { Prisma, type RelayClient, type RelayDevice, type RelayOutbox } from './client';
import { RelayError } from './errors';
import type { ActionInput, DeviceInput, RecordsInput, ResultInput } from './inputs';

const json = (value: Prisma.JsonValue) => value === null ? Prisma.JsonNull : value;
const devicePublic = {
  id: true, userId: true, userName: true, role: true, branchIds: true, name: true,
  createdAt: true, lastSeenAt: true, revokedAt: true,
} satisfies Prisma.RelayDeviceSelect;

export interface RequestUsage {
  bytesIn: number;
  bytesOut: number;
  recordsWritten: number;
  actionsReceived: number;
}

export class RelayStore {
  constructor(private readonly db: RelayClient) {}

  findDevice(tokenSha256: string) {
    return this.db.relayDevice.findUnique({ where: { tokenSha256 } });
  }

  touchDevice(id: string, now: Date) {
    return this.db.relayDevice.updateMany({
      where: { id, revokedAt: null, OR: [{ lastSeenAt: null }, { lastSeenAt: { lte: new Date(now.getTime() - 60000) } }] },
      data: { lastSeenAt: now },
    });
  }

  touchWorker(now: Date) {
    return this.db.relayWorker.update({ where: { id: 1 }, data: { lastSeenAt: now } });
  }

  async workerState() {
    const state = await this.db.relayWorker.findUniqueOrThrow({ where: { id: 1 } });
    return { lastPcSeq: state.lastPcSeq, lastSeenAt: state.lastSeenAt };
  }

  writeRecords(input: RecordsInput) {
    return this.db.$transaction(async tx => {
      // Serializes worker batches before any revision is allocated.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(74104, 1)`;
      const state = await tx.relayWorker.findUniqueOrThrow({ where: { id: 1 } });
      if (state.snapshotId) throw new RelayError(409, 'SNAPSHOT_IN_PROGRESS', 'Finish the snapshot first.');
      if (BigInt(input.pcSeq) < BigInt(state.lastPcSeq)) {
        throw new RelayError(409, 'STALE_PC_CURSOR', 'The relay already holds a newer PC cursor.');
      }
      for (const record of input.records) {
        const data = {
          minRole: record.minRole ?? null,
          branchId: record.branchId, op: record.op, pcSeq: input.pcSeq,
          data: record.op === 'delete' ? Prisma.DbNull : json(record.data!),
        };
        await tx.relayRecord.upsert({
          where: { entity_entityId: { entity: record.entity, entityId: record.id } },
          create: { entity: record.entity, entityId: record.id, ...data }, update: data,
        });
      }
      await tx.relayWorker.update({ where: { id: 1 }, data: { lastPcSeq: input.pcSeq, lastSeenAt: new Date() } });
      return { stored: input.records.length, lastPcSeq: input.pcSeq };
    }, { timeout: 30000 });
  }

  beginSnapshot(input: { snapshotId: string; pcSeq: string; expectedPcSeq: string }) {
    return this.db.$transaction(async tx => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(74104, 1)`;
      const state = await tx.relayWorker.findUniqueOrThrow({ where: { id: 1 } });
      if (state.completedSnapshotId === input.snapshotId) return { completed: true };
      if (state.snapshotId === input.snapshotId) return { completed: false };
      if (state.lastPcSeq !== input.expectedPcSeq) throw new RelayError(409, 'SNAPSHOT_CONFLICT', 'Restart the snapshot.');
      await tx.relaySnapshotRecord.deleteMany({});
      await tx.relayWorker.update({ where: { id: 1 }, data: { snapshotId: input.snapshotId, snapshotPcSeq: input.pcSeq } });
      return { completed: false };
    });
  }

  snapshotPage(input: { snapshotId: string; records: RecordsInput['records'] }) {
    return this.db.$transaction(async tx => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(74104, 1)`;
      const state = await tx.relayWorker.findUniqueOrThrow({ where: { id: 1 } });
      if (state.snapshotId !== input.snapshotId) throw new RelayError(409, 'SNAPSHOT_CONFLICT', 'Restart the snapshot.');
      const records = JSON.stringify(input.records);
      await tx.$executeRaw`INSERT INTO relay_snapshot_records (snapshot_id, entity, entity_id, branch_id, min_role, op, data)
        SELECT ${input.snapshotId}::uuid, x.entity, x.id::uuid, x."branchId"::uuid, x."minRole", x.op,
          CASE WHEN x.op = 'delete' THEN NULL ELSE x.data END
        FROM jsonb_to_recordset(${records}::jsonb) AS x(entity text, id text, "branchId" text, "minRole" text, op text, data jsonb)
        ON CONFLICT (snapshot_id, entity, entity_id) DO UPDATE SET branch_id = EXCLUDED.branch_id, min_role = EXCLUDED.min_role, op = EXCLUDED.op, data = EXCLUDED.data`;
      return { stored: input.records.length };
    });
  }

  finishSnapshot(snapshotId: string) {
    return this.db.$transaction(async tx => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(74104, 1)`;
      const state = await tx.relayWorker.findUniqueOrThrow({ where: { id: 1 } });
      if (state.completedSnapshotId === snapshotId) return { completed: true };
      if (state.snapshotId !== snapshotId || state.snapshotPcSeq === null) throw new RelayError(409, 'SNAPSHOT_CONFLICT', 'Restart the snapshot.');
      // Old records remain readable until this transaction publishes every page.
      await tx.$executeRaw`UPDATE relay_records r SET op = 'delete', data = NULL, pc_seq = ${state.snapshotPcSeq}
        WHERE r.op <> 'delete' AND NOT EXISTS (SELECT 1 FROM relay_snapshot_records s
          WHERE s.snapshot_id = ${snapshotId}::uuid AND s.entity = r.entity AND s.entity_id = r.entity_id)`;
      await tx.$executeRaw`INSERT INTO relay_records (entity, entity_id, branch_id, min_role, op, data, pc_seq)
        SELECT entity, entity_id, branch_id, min_role, op, data, ${state.snapshotPcSeq} FROM relay_snapshot_records
        WHERE snapshot_id = ${snapshotId}::uuid ORDER BY entity, entity_id
        ON CONFLICT (entity, entity_id) DO UPDATE SET branch_id = EXCLUDED.branch_id, op = EXCLUDED.op,
          min_role = EXCLUDED.min_role, data = EXCLUDED.data, pc_seq = EXCLUDED.pc_seq`;
      await tx.relayWorker.update({ where: { id: 1 }, data: { lastPcSeq: state.snapshotPcSeq,
        snapshotId: null, snapshotPcSeq: null, completedSnapshotId: snapshotId, lastSeenAt: new Date() } });
      await tx.relaySnapshotRecord.deleteMany({ where: { snapshotId } });
      return { completed: true };
    }, { timeout: 30000 });
  }

  async readRecords(branchIds: string[], after: string, limit: number, options: { fullCopy?: boolean; snapshotHorizon?: string; role?: string } = {}) {
    const { rows, horizon } = await this.db.$transaction(async tx => {
      const state = await tx.relayWorker.findUniqueOrThrow({ where: { id: 1 }, select: { prunedThroughRev: true } });
      const revision = BigInt(after);
      const invalidSnapshot = options.fullCopy && revision > 0n &&
        (options.snapshotHorizon === undefined || BigInt(options.snapshotHorizon) !== state.prunedThroughRev);
      if (invalidSnapshot || (!options.fullCopy && revision > 0n && revision < state.prunedThroughRev)) {
        throw new RelayError(410, 'RESYNC_REQUIRED', 'Start a full copy from revision zero.');
      }
      const rows = await tx.relayRecord.findMany({
        where: { rev: { gt: BigInt(after) }, OR: [
          { branchId: null }, { branchId: { in: branchIds } }, { previousBranchIds: { hasSome: branchIds } },
        ] },
        orderBy: { rev: 'asc' }, take: limit + 1,
      });
      return { rows, horizon: state.prunedThroughRev };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
    const records = rows.slice(0, limit);
    const hasMore = rows.length > limit;
    const lastRev = records.at(-1)?.rev ?? BigInt(after);
    // A completed full copy can advance over pruned revisions without skipping
    // any remaining visible records, even if its newest live row is older.
    const nextRev = !hasMore && horizon > lastRev ? horizon : lastRev;
    return {
      records: records.map(({ entityId, previousBranchIds, ...row }) => {
        const visible = (row.branchId === null || branchIds.includes(row.branchId)) && (row.minRole !== 'ADMIN' || options.role === 'ADMIN');
        return { ...row, id: entityId, rev: row.rev.toString(), op: visible ? row.op : 'delete', data: visible ? row.data : null };
      }),
      nextRev: nextRev.toString(), hasMore,
      ...(options.fullCopy ? { snapshotHorizon: horizon.toString() } : {}),
    };
  }

  claim(limit: number) {
    return this.db.$queryRaw<Array<RelayOutbox & { hasBlob: boolean }>>`
      WITH candidates AS (
        SELECT id FROM relay_outbox
        WHERE status = 'pending' OR (status = 'claimed' AND claimed_at < now() - interval '5 minutes')
        ORDER BY received_at, id FOR UPDATE SKIP LOCKED LIMIT ${limit}
      )
      UPDATE relay_outbox o SET status = 'claimed', claimed_at = now(), attempts = attempts + 1
      WHERE o.id IN (SELECT id FROM candidates)
      RETURNING o.id, o.device_id AS "deviceId", o.user_id AS "userId", o.branch_id AS "branchId",
        o.type, o.payload, o.created_at AS "createdAt", o.received_at AS "receivedAt", o.status,
        o.claimed_at AS "claimedAt", o.attempts, o.result, o.resolved_at AS "resolvedAt",
        o.photo_mime AS "photoMime", o.photo_size AS "photoSize",
        EXISTS (SELECT 1 FROM relay_blobs b WHERE b.outbox_id = o.id) AS "hasBlob"`;
  }

  async getBlob(id: string) {
    const blob = await this.db.relayBlob.findUnique({ where: { outboxId: id }, select: { mime: true, bytes: true } });
    if (!blob) throw new RelayError(404, 'NOT_FOUND', 'Photo not found.');
    return blob;
  }

  saveResult(id: string, input: ResultInput) {
    return this.db.$transaction(async tx => {
      const rows = await tx.$queryRaw<Array<{ status: string }>>`SELECT status FROM relay_outbox WHERE id = ${id}::uuid FOR UPDATE`;
      if (!rows[0]) throw new RelayError(404, 'NOT_FOUND', 'Action not found.');
      if (['applied', 'refused', 'failed'].includes(rows[0].status)) {
        if (rows[0].status !== input.status) throw new RelayError(409, 'RESULT_CONFLICT', 'Action already has a different final status.');
      } else {
        await tx.relayOutbox.update({ where: { id }, data: { status: input.status, result: json(input.result), resolvedAt: new Date() } });
      }
      if (input.status === 'applied' || input.status === 'refused') await tx.relayBlob.deleteMany({ where: { outboxId: id } });
      return tx.relayOutbox.findUniqueOrThrow({ where: { id }, select: { id: true, status: true, result: true, resolvedAt: true } });
    });
  }

  registerDevice(input: DeviceInput) {
    const data = { ...input, role: input.role ?? 'EMPLOYEE' };
    return this.db.relayDevice.upsert({ where: { id: input.id }, create: data, update: data, select: devicePublic });
  }

  async revokeDevice(id: string) {
    const result = await this.db.relayDevice.updateMany({ where: { id, revokedAt: null }, data: { revokedAt: new Date() } });
    if (!result.count && !await this.db.relayDevice.findUnique({ where: { id }, select: { id: true } })) {
      throw new RelayError(404, 'NOT_FOUND', 'Device not found.');
    }
    return { id, revoked: true };
  }

  devices() {
    return this.db.relayDevice.findMany({ select: devicePublic, orderBy: { createdAt: 'desc' } });
  }

  enqueue(device: RelayDevice, input: ActionInput) {
    return this.db.$transaction(async tx => {
      const { photo, ...actionInput } = input;
      const inserted = await tx.relayOutbox.createMany({ data: [{
        ...actionInput, createdAt: new Date(input.createdAt), payload: json(input.payload),
        deviceId: device.id, userId: device.userId,
        status: photo ? 'awaiting_photo' : 'pending', photoMime: photo?.mime, photoSize: photo?.size,
      }], skipDuplicates: true });
      const action = await tx.relayOutbox.findUniqueOrThrow({ where: { id: input.id } });
      if (action.deviceId !== device.id) throw new RelayError(409, 'ACTION_ID_CONFLICT', 'Action ID belongs to another device.');
      return { created: inserted.count === 1, id: action.id, status: action.status };
    });
  }

  putBlob(deviceId: string, id: string, mime: string, bytes: Buffer) {
    return this.db.$transaction(async tx => {
      const rows = await tx.$queryRaw<Array<{ deviceId: string; status: string; photoMime: string | null; photoSize: number | null }>>`
        SELECT device_id AS "deviceId", status, photo_mime AS "photoMime", photo_size AS "photoSize"
        FROM relay_outbox WHERE id = ${id}::uuid FOR UPDATE`;
      if (!rows[0] || rows[0].deviceId !== deviceId) throw new RelayError(404, 'NOT_FOUND', 'Action not found.');
      const action = rows[0];
      if (action.status !== 'pending' && action.status !== 'awaiting_photo') {
        throw new RelayError(409, 'ACTION_NOT_PENDING', 'Photos can be uploaded while an action is awaiting a photo or pending.');
      }
      if (action.status === 'awaiting_photo' && (mime !== action.photoMime || action.photoSize === null ||
        Math.abs(bytes.length - action.photoSize) * 100 > action.photoSize * 5)) {
        throw new RelayError(400, 'PHOTO_DECLARATION_MISMATCH', 'Photo must match the declared MIME and size within five percent.');
      }
      await tx.relayBlob.upsert({
        where: { outboxId: id }, create: { outboxId: id, mime, bytes, size: bytes.length },
        update: { mime, bytes, size: bytes.length, createdAt: new Date() },
      });
      if (action.status === 'awaiting_photo') await tx.relayOutbox.update({ where: { id }, data: { status: 'pending' } });
      return { id, size: bytes.length };
    });
  }

  async actionResults(deviceId: string, ids: string[], role='EMPLOYEE') {
    const rows=await this.db.relayOutbox.findMany({
      where: { deviceId, id: { in: ids } }, select: { id: true, type: true, status: true, result: true, resolvedAt: true },
    });
    return rows.map(({type,...row})=>role!=='ADMIN'&&type==='report.request'
      ? {...row,status:'refused',result:{code:'FORBIDDEN',message:'Only administrators can view this result.'}}:row);
  }

  countUsage(input: RequestUsage) {
    return this.db.$executeRaw`
      INSERT INTO relay_usage (day, requests, bytes_in, bytes_out, records_written, actions_received)
      VALUES ((now() AT TIME ZONE 'UTC')::date, 1, ${BigInt(input.bytesIn)}, ${BigInt(input.bytesOut)}, ${input.recordsWritten}, ${input.actionsReceived})
      ON CONFLICT (day) DO UPDATE SET requests = relay_usage.requests + 1,
        bytes_in = relay_usage.bytes_in + EXCLUDED.bytes_in, bytes_out = relay_usage.bytes_out + EXCLUDED.bytes_out,
        records_written = relay_usage.records_written + EXCLUDED.records_written,
        actions_received = relay_usage.actions_received + EXCLUDED.actions_received`;
  }

  async usage() {
    const since = new Date();
    since.setUTCHours(0, 0, 0, 0);
    since.setUTCDate(since.getUTCDate() - 30);
    const days = await this.db.relayUsage.findMany({
      where: { day: { gte: since } },
      orderBy: { day: 'desc' },
    });
    const totals = days.reduce((sum, day) => ({
      requests: sum.requests + day.requests, bytesIn: sum.bytesIn + day.bytesIn,
      bytesOut: sum.bytesOut + day.bytesOut, recordsWritten: sum.recordsWritten + day.recordsWritten,
      actionsReceived: sum.actionsReceived + day.actionsReceived,
    }), { requests: 0, bytesIn: 0n, bytesOut: 0n, recordsWritten: 0, actionsReceived: 0 });
    return { days, totals };
  }

  upkeep(now = new Date()) {
    return this.db.$transaction(async tx => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(74104, 1)`;
      const claimed = await tx.relayWorker.updateMany({
        where: { id: 1, OR: [{ lastUpkeepAt: null }, { lastUpkeepAt: { lte: new Date(now.getTime() - 3600000) } }] },
        data: { lastUpkeepAt: now },
      });
      if (!claimed.count) return false;
      const monthAgo = new Date(now.getTime() - 30 * 86400000);
      await tx.$executeRaw`
        WITH removed AS (
          DELETE FROM relay_records WHERE op = 'delete' AND updated_at < ${monthAgo} RETURNING rev
        )
        UPDATE relay_worker SET pruned_through_rev = GREATEST(pruned_through_rev,
          COALESCE((SELECT MAX(rev) FROM removed), 0)) WHERE id = 1`;
      await tx.relayOutbox.updateMany({
        where: { status: 'awaiting_photo', receivedAt: { lt: new Date(now.getTime() - 7 * 86400000) } },
        data: { status: 'failed', result: { reason: 'PHOTO_NEVER_ARRIVED' }, resolvedAt: now },
      });
      // Delete action headers first so cascades follow the same action -> blob
      // lock order as result writes and uploads.
      await tx.relayOutbox.deleteMany({ where: { status: { in: ['applied', 'refused', 'failed'] }, resolvedAt: { lt: monthAgo } } });
      await tx.relayBlob.deleteMany({ where: { OR: [
        { outbox: { status: { in: ['applied', 'refused', 'failed'] } } },
        { createdAt: { lt: new Date(now.getTime() - 7 * 86400000) } },
      ] } });
      return true;
    }, { timeout: 30000 });
  }
}
