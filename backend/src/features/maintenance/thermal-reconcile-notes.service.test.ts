import { describe, expect, it, vi } from 'vitest';

const { prismaMock } = vi.hoisted(() => ({
  prismaMock: { $queryRawUnsafe: vi.fn() },
}));

vi.mock('../../lib/prisma', () => ({
  prisma: prismaMock,
  transactionModel: {},
  activityLogModel: {},
}));

import { ThermalReconcileNotesService } from './thermal-reconcile-notes.service';

describe('ThermalReconcileNotesService', () => {
  it('reports TABLE_ABSENT and returns [] when the audit table has not been created yet', async () => {
    prismaMock.$queryRawUnsafe.mockResolvedValueOnce([{ exists: false }]);
    const result = await ThermalReconcileNotesService.list();
    expect(result.status).toBe('TABLE_ABSENT');
    expect(result.notes).toEqual([]);
    expect(prismaMock.$queryRawUnsafe).toHaveBeenCalledTimes(1);
  });

  it('returns rows sorted by id descending when the table exists', async () => {
    prismaMock.$queryRawUnsafe
      .mockResolvedValueOnce([{ exists: true }])
      .mockResolvedValueOnce([
        { id: BigInt(5), runAt: new Date('2026-09-28T10:00:00Z'), outcome: 'SKIPPED_CUSTOMISED', reason: 'r5', diffFields: ['description'] },
        { id: BigInt(4), runAt: new Date('2026-09-27T10:00:00Z'), outcome: 'CONVERGED_FROM_VARIANT_A', reason: 'r4', diffFields: [] },
      ]);
    const result = await ThermalReconcileNotesService.list();
    expect(result.status).toBe('READY');
    expect(result.notes).toEqual([
      { id: 5, runAt: '2026-09-28T10:00:00.000Z', outcome: 'SKIPPED_CUSTOMISED', reason: 'r5', diffFields: ['description'] },
      { id: 4, runAt: '2026-09-27T10:00:00.000Z', outcome: 'CONVERGED_FROM_VARIANT_A', reason: 'r4', diffFields: [] },
    ]);
  });

  it('handles a null diffFields cell defensively', async () => {
    prismaMock.$queryRawUnsafe
      .mockResolvedValueOnce([{ exists: true }])
      .mockResolvedValueOnce([{ id: BigInt(1), runAt: new Date('2026-09-28T10:00:00Z'), outcome: 'NO_ROW', reason: 'none', diffFields: null }]);
    const result = await ThermalReconcileNotesService.list();
    expect(result.notes[0].diffFields).toEqual([]);
  });
});
