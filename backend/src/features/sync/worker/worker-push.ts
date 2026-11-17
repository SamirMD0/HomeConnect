import { randomUUID } from 'node:crypto';
import { Prisma, type SyncWorkerState } from '@prisma/client';
import { readChanges } from '../sync-feed.service';
import { todayInBusinessTimezone, getBusinessTimezone } from '../../financial/domain/business-date';
import { snapshotCursor, sourcePage, systemScope, saveProgress, snapshotEntities } from './worker-source';
import { RelayFailure, type WorkerRelay } from './relay-client';

const defaults = { cursor: snapshotCursor, page: sourcePage, scope: systemScope, save: saveProgress, feed: readChanges };
export type PushDependencies = typeof defaults;
interface Snapshot { id: string; seq: string; entity: number; after: string; cutoff: string; expected: string }
export const isOpening = (start: string, end: string, clock: string) => start === end ||
  (start < end ? clock >= start && clock < end : clock >= start || clock < end);
export function businessClock(now = new Date()) {
  return new Intl.DateTimeFormat('en-GB', { timeZone: getBusinessTimezone(), hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(now);
}

export async function pushRecords(state: SyncWorkerState, relay: Pick<WorkerRelay, 'request'>, deadline: number, deps = defaults): Promise<boolean> {
  try {
    if (!state.snapshotDone) {
      let progress = state.snapshotProgress as unknown as Snapshot | null;
      if (!progress?.id) {
        // This barrier is read before ANY entity is enumerated.
        const seq = await deps.cursor();
        if (seq === null) return false;
        const remote = await relay.request('/state');
        const cutoff = new Date(todayInBusinessTimezone() + 'T00:00:00Z');
        cutoff.setUTCDate(cutoff.getUTCDate() - 90);
        progress = { id: randomUUID(), seq, entity: 0, after: '', cutoff: cutoff.toISOString(), expected: remote.lastPcSeq };
        await deps.save({ snapshotProgress: { ...progress } });
      }
      const started = await relay.request('/snapshot/begin', { snapshotId: progress.id, pcSeq: progress.seq, expectedPcSeq: progress.expected });
      if (!started.completed) {
        const scope = await deps.scope();
        while (progress.entity < snapshotEntities.length) {
          if (Date.now() >= deadline) return false;
          const page = await deps.page(snapshotEntities[progress.entity], progress.after, progress.cutoff, scope, deadline);
          await relay.request('/snapshot/page', { snapshotId: progress.id, records: page.records });
          progress = { ...progress, entity: progress.entity + (page.done ? 1 : 0), after: page.done ? '' : page.after };
          await deps.save({ snapshotProgress: { ...progress } });
        }
        await relay.request('/snapshot/finish', { snapshotId: progress.id });
      }
      await deps.save({ snapshotDone: true, lastPushedSeq: progress.seq, snapshotProgress: Prisma.DbNull, figureSnapshots: {} });
      state = { ...state, snapshotDone: true, lastPushedSeq: progress.seq, snapshotProgress: null };
    }
    const scope = await deps.scope();
    for (let batch = 0; batch < 20; batch++) {
      if (Date.now() >= deadline) return false;
      const changes = await deps.feed(BigInt(state.lastPushedSeq), 500, scope, { deadline, system: true });
      if ('busy' in changes && changes.busy) return false;
      if (changes.nextSeq !== state.lastPushedSeq || changes.records.length > 0) {
        await relay.request('/records', { pcSeq: changes.nextSeq, records: changes.records });
        await deps.save({ lastPushedSeq: changes.nextSeq });
        state.lastPushedSeq = changes.nextSeq;
      }
      if (!changes.hasMore) return true;
    }
    return false;
  } catch (error) {
    if (error instanceof RelayFailure && error.status === 409 &&
      ['STALE_PC_CURSOR', 'SNAPSHOT_CONFLICT', 'SNAPSHOT_IN_PROGRESS'].includes(error.code ?? '')) {
      await deps.save({ snapshotDone: false, snapshotProgress: Prisma.DbNull });
      return false; // Next bounded cycle starts a replacement, including after backup restore.
    }
    throw error;
  }
}

export async function refreshCustomerDates(state: SyncWorkerState, relay: Pick<WorkerRelay, 'request'>, deadline: number, deps = defaults) {
  const today = todayInBusinessTimezone();
  if (state.lastDateRefresh?.toISOString().slice(0, 10) === today) return;
  const start = state.openingStart.toISOString().slice(11, 16);
  if (businessClock() < start) return;
  const scope = await deps.scope();
  const saved = state.snapshotProgress as { date?: string; after?: string } | null;
  let after = saved?.date === today ? saved.after ?? '' : '';
  while (Date.now() < deadline) {
    const page = await deps.page('customer', after, '', scope, deadline);
    const records = page.records.filter(record => record.op === 'upsert' &&
      !new Prisma.Decimal((record.data as { financial: { outstanding: string } }).financial.outstanding).isZero());
    if (records.length) await relay.request('/records', { pcSeq: state.lastPushedSeq, records });
    if (page.done) {
      await deps.save({ lastDateRefresh: new Date(today + 'T00:00:00Z'), snapshotProgress: Prisma.DbNull });
      return;
    }
    after = page.after;
    await deps.save({ snapshotProgress: { date: today, after } });
  }
}
