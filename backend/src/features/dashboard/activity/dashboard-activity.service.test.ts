import { describe, expect, it } from 'vitest';
import { DashboardActivityService } from './dashboard-activity.service';

describe('DashboardActivityService', () => {
  it('merges domain activity newest first and caps the feed', () => {
    const records = {
      legacy: [], payments: [], debts: [], plans: [], supplierTransactions: [], serviceAudits: [], products: [], presets: [],
      serviceJobs: [{ id: 'j', jobNumber: 'S-1', customerId: 'c', customer: { name: 'Ali' }, createdAt: new Date('2026-08-01T10:00:00Z'), createdBy: { fullName: 'Admin' } }],
    };
    const result = DashboardActivityService.aggregate(records as never, 1);
    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toMatchObject({ module: 'service', actor: 'Admin', entityId: 'j' });
  });
});
