import { ServiceJobStatus, ServiceRequestType, WarrantyStatus } from '@prisma/client';
import { describe, expect, it } from 'vitest';
import { resolveDashboardRange } from '../shared/dashboard-range';
import { SERVICE_STATUS_ORDER, ServiceAnalyticsService } from './service-analytics.service';

describe('ServiceAnalyticsService', () => {
  it('maps every status exactly once and counts completion by completedAt', () => {
    const jobs = SERVICE_STATUS_ORDER.map((status, index) => job(String(index), status, '2026-07-01', index === 7 ? new Date('2026-08-01T10:00:00Z') : null));
    const result = ServiceAnalyticsService.aggregate(jobs as never, resolveDashboardRange({}, '2026-08-01'), '2026-08-01');
    expect(result.statusDistribution).toHaveLength(SERVICE_STATUS_ORDER.length);
    expect(result.statusDistribution.reduce((sum, point) => sum + point.count, 0)).toBe(jobs.length);
    expect(result.totals.completed).toBe(1);
  });

  it('treats exactly N days as current and N+1 as aging', () => {
    const jobs = [job('a', ServiceJobStatus.RECEIVED, '2026-07-02'), job('b', ServiceJobStatus.RECEIVED, '2026-07-01')];
    const result = ServiceAnalyticsService.aggregate(jobs as never, resolveDashboardRange({}, '2026-08-01'), '2026-08-01');
    expect(result.agingJobs.map((row) => row.id)).toEqual(['b']);
  });
});

function job(id: string, status: ServiceJobStatus, created: string, completedAt: Date | null = null) {
  return { id, jobNumber: `JOB-${id}`, customerId: 'c', customer: { id: 'c', name: 'Ali' }, productId: null, manualProductName: null, manualProductModel: null, manualProductBrand: null, manualProductNotes: null, requestType: ServiceRequestType.ON_CALL, issueDescription: '', requestedPartName: null, routingDecision: null, companyName: null, sentToCompanyDate: null, receivedFromCompanyDate: null, warrantyStatus: WarrantyStatus.UNKNOWN, warrantyNotes: null, warrantyProvider: null, warrantyExpiresAt: null, estimatedPrice: null, finalPrice: null, priceNotes: null, serviceCreatedDate: new Date(`${created}T00:00:00Z`), homeVisitScheduledDate: null, returnedToCustomerDate: null, status, notes: null, createdById: 'u', updatedById: null, createdAt: new Date(), updatedAt: new Date(), completedAt, cancelledAt: null, cancelledById: null, cancelledReason: null };
}

