import { ServiceJobStatus } from '@prisma/client';
import { describe, expect, it } from 'vitest';
import {
  assertServiceDateOrder,
  assertStatusTransitionAllowed,
  isRoutineForwardTransition,
  requiredDateForTransition,
} from './service-status';

describe('service status rules', () => {
  it('blocks terminal transitions outside reopen', () => {
    expect(() =>
      assertStatusTransitionAllowed(ServiceJobStatus.CANCELLED, ServiceJobStatus.RECEIVED)
    ).toThrow('reopen');
  });

  it('distinguishes routine forward and sensitive transitions', () => {
    expect(isRoutineForwardTransition(ServiceJobStatus.RECEIVED, ServiceJobStatus.IN_WORKSHOP_REPAIR)).toBe(true);
    expect(isRoutineForwardTransition(ServiceJobStatus.READY_FOR_PICKUP, ServiceJobStatus.RECEIVED)).toBe(false);
    expect(isRoutineForwardTransition(ServiceJobStatus.READY_FOR_PICKUP, ServiceJobStatus.DELIVERED_TO_CUSTOMER)).toBe(false);
  });

  it('returns required transition dates', () => {
    expect(requiredDateForTransition(ServiceJobStatus.IN_WORKSHOP_REPAIR, ServiceJobStatus.SENT_TO_COMPANY)).toBe('sentToCompanyDate');
    expect(requiredDateForTransition(ServiceJobStatus.SENT_TO_COMPANY, ServiceJobStatus.READY_FOR_PICKUP)).toBe('receivedFromCompanyDate');
    expect(requiredDateForTransition(ServiceJobStatus.READY_FOR_PICKUP, ServiceJobStatus.DELIVERED_TO_CUSTOMER)).toBe('returnedToCustomerDate');
    expect(requiredDateForTransition(ServiceJobStatus.READY_FOR_PICKUP, ServiceJobStatus.PRODUCT_EXCHANGE)).toBe('returnedToCustomerDate');
    expect(requiredDateForTransition(ServiceJobStatus.RECEIVED, ServiceJobStatus.COMPANY_HOME_MAINTENANCE)).toBeNull();
  });

  it('enforces chronological business dates', () => {
    expect(() => assertServiceDateOrder({
      serviceCreatedDate: '2026-07-20',
      sentToCompanyDate: '2026-07-19',
    })).toThrow('cannot be earlier');
  });
});
