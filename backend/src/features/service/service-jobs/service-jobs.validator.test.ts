import { ServiceRequestType, ServiceRoutingDecision } from '@prisma/client';
import { describe, expect, it } from 'vitest';
import { createServiceJobSchema } from './service-jobs.validator';

const base = {
  customerId: '11111111-1111-4111-8111-111111111111',
  requestType: ServiceRequestType.WORKSHOP_DROP_OFF,
  issueDescription: 'Does not cool',
  serviceCreatedDate: '2026-07-29',
};

describe('service job validation', () => {
  it('accepts either a linked or manual product', () => {
    expect(createServiceJobSchema.parse({ ...base, productId: '22222222-2222-4222-8222-222222222222' }).productId).toBeTruthy();
    expect(createServiceJobSchema.parse({ ...base, manualProductName: 'براد' }).manualProductName).toBe('براد');
  });

  it('rejects both/neither product modes and conditional omissions', () => {
    expect(() => createServiceJobSchema.parse(base)).toThrow();
    expect(() => createServiceJobSchema.parse({ ...base, productId: '22222222-2222-4222-8222-222222222222', manualProductName: 'Fan' })).toThrow();
    expect(() => createServiceJobSchema.parse({ ...base, manualProductName: 'Fan', requestType: ServiceRequestType.PART_REPLACEMENT })).toThrow('Requested part');
    expect(() => createServiceJobSchema.parse({ ...base, manualProductName: 'Fan', routingDecision: ServiceRoutingDecision.COMPANY })).toThrow('Company name');
  });
});
