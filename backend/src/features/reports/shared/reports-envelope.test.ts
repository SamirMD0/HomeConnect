import { describe, expect, expectTypeOf, it } from 'vitest';
import type { ReportsData, ReportsEnvelope } from './reports-envelope';

describe('ReportsEnvelope', () => {
  it('keeps every reporting domain namespaced', () => {
    type EmptyDomain = Record<string, never>;
    type Data = ReportsData<
      { orderCount: number },
      { paidCount: number },
      EmptyDomain,
      EmptyDomain,
      EmptyDomain
    >;
    const envelope: ReportsEnvelope<Data> = {
      meta: {
        from: '2026-08-01', to: '2026-08-17', previousFrom: '2026-07-15',
        previousTo: '2026-07-31', preset: 'thisMonth', generatedAt: '2026-08-17T10:00:00.000Z', currency: 'USD',
      },
      data: {
        sales: { orderCount: 2 }, customers: { paidCount: 1 }, suppliers: {}, inventory: {}, risk: {},
      },
    };

    expect(Object.keys(envelope.data)).toEqual(['sales', 'customers', 'suppliers', 'inventory', 'risk']);
    expectTypeOf(envelope.data.sales.orderCount).toEqualTypeOf<number>();
  });
});
