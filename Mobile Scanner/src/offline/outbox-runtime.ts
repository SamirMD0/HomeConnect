import { selectedBranchHeaders } from '../branches/branch-selection';
import type { CloudPairing } from './cloud-pairing';
import { openLocalDb } from './expo-db';
import { ownerKey, saveAction, type SaveAction } from './outbox';
import { requestCloudSync } from './sync-status';
let pairing: CloudPairing | null = null;
let saves: Promise<unknown> = Promise.resolve();
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
