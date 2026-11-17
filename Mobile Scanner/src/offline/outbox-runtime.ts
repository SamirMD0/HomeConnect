import { selectedBranchHeaders } from '../branches/branch-selection';
import type { CloudPairing } from './cloud-pairing';
import { openLocalDb } from './expo-db';
import { ownerKey, saveAction, type SaveAction } from './outbox';
import { requestCloudSync } from './sync-status';
import { reportKey } from './cloud-figures';
import { listOutbox, type OutboxRow } from './outbox';
import type { ReportFilters } from '@shared/report-request';
import { REPORT_CATALOG } from '@shared/report-catalog';
let pairing: CloudPairing | null = null;
let saves: Promise<unknown> = Promise.resolve();
const reportFlights = new Map<string, Promise<OutboxRow>>();
export function enqueueCloudReport(reportId: string, filters: ReportFilters) {
  const owner = pairing,
    branchId = selectedBranchHeaders()['X-Branch-Scope'];
  if (!owner || owner.role !== 'ADMIN' || !branchId)
    return Promise.reject(
      new Error('Only administrators can request reports for a selected branch.')
    );
  const identity = JSON.stringify([ownerKey(owner), branchId, reportKey(reportId, filters)]);
  const flight = reportFlights.get(identity);
  if (flight) return flight;
  const next = (async () => {
    const rows = await listOutbox(await openLocalDb(), ownerKey(owner));
    if (pairing !== owner) throw new Error('The phone pairing changed.');
    for (const row of rows) {
      if (
        row.archived ||
        row.owner !== ownerKey(owner) ||
        row.type !== 'report.request' ||
        row.branch_id !== branchId
      )
        continue;
      const payload = JSON.parse(row.payload);
      if (
        payload.reportId &&
        reportKey(payload.reportId, payload.filters) === reportKey(reportId, filters)
      )
        return row;
    }
    if (pairing !== owner) throw new Error('The phone pairing changed.');
    const definition = REPORT_CATALOG.find((item) => item.id === reportId);
    const submissionKey = (await import('expo-crypto')).randomUUID();
    if (pairing !== owner) throw new Error('The phone pairing changed.');
    return enqueueCloudAction({
      type: 'report.request',
      branchId,
      submissionKey,
      payload: { reportId, filters },
      summary: `Report · ${definition?.title ?? reportId} · ${definition?.kind.startsWith('legacy') ? filters.month : filters.period}`,
    });
  })().finally(() => reportFlights.delete(identity));
  reportFlights.set(identity, next);
  return next;
}
export function configureOutbox(value: CloudPairing | null) {
  pairing = value;
}
export const waitForOutboxSaves = () => saves;
export function enqueueCloudAction(
  input: Omit<SaveAction, 'owner' | 'branchId'> & { branchId?: string }
) {
  const owner = pairing;
  const branchId = input.branchId ?? selectedBranchHeaders()['X-Branch-Scope'];
  const next = saves.then(async () => {
    if (!owner || pairing !== owner || !branchId || !owner.branchIds.includes(branchId))
      throw new Error('Select a paired branch and try saving again.');
    const db = await openLocalDb();
    if (pairing !== owner)
      throw new Error('The phone pairing changed. Check Waiting before saving again.');
    const row = await saveAction(db, { ...input, owner: ownerKey(owner), branchId });
    // Save resolves from SQLite, independently of connectivity or the relay's response.
    void requestCloudSync();
    return row;
  });
  saves = next.catch(() => {});
  return next;
}
