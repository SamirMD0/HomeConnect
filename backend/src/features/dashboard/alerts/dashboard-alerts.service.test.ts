import { describe, expect, it } from 'vitest';
import { DASHBOARD_ALERT_THRESHOLDS } from '../dashboard.config';

describe('dashboard alert configuration', () => {
  it('keeps operational thresholds centralized and explicit', () => {
    expect(DASHBOARD_ALERT_THRESHOLDS).toEqual({
      largeCustomerBalance: '1000.00',
      agingServiceJobDays: 30,
      companyServiceJobDays: 14,
      readyForPickupDays: 7,
    });
  });
});

