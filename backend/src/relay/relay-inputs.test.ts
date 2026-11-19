import { describe, expect, it } from 'vitest';
import { snapshotPageInput, recordsInput } from './inputs';

// A real shop's Main branch id: UUID-shaped, but its variant digit (0) is not RFC 4122.
const shopBranch = 'de9fa656-1fa7-579a-0c16-63cd6cbbed95';
const record = { entity: 'customer', id: '0062e780-9083-4fff-84d5-28b9b6b6dd14', branchId: shopBranch, op: 'upsert', data: { name: 'A' } };

describe('relay id validation', () => {
  it('accepts UUID-shaped shop ids that are not RFC 4122', () => {
    expect(snapshotPageInput.safeParse({ snapshotId: '0062e780-9083-4fff-84d5-28b9b6b6dd14', records: [record, { ...record, entity: 'branch', id: shopBranch }] }).success).toBe(true);
    expect(recordsInput.safeParse({ pcSeq: '1', records: [record] }).success).toBe(true);
  });
  it('lower-cases ids and still rejects text that is not UUID-shaped', () => {
    const parsed = snapshotPageInput.parse({ snapshotId: '0062e780-9083-4fff-84d5-28b9b6b6dd14', records: [{ ...record, branchId: shopBranch.toUpperCase() }] });
    expect(parsed.records[0].branchId).toBe(shopBranch);
    for (const branchId of ['main', shopBranch.slice(1), `${shopBranch}0`, "de9fa656-1fa7-579a-0c16-63cd6cbbed9'"])
      expect(snapshotPageInput.safeParse({ snapshotId: '0062e780-9083-4fff-84d5-28b9b6b6dd14', records: [{ ...record, branchId }] }).success).toBe(false);
  });
});
