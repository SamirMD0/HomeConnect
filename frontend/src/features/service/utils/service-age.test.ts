import { describe, expect, it } from 'vitest';
import { getServiceJobAgeState } from './service-age';

const now = new Date(2026, 6, 29, 12);

describe('service job age status', () => {
  it('marks an open job active before 30 days', () => {
    expect(getServiceJobAgeState('2026-07-10', 'RECEIVED', now)).toEqual({
      state: 'ACTIVE',
      daysOpen: 19,
    });
  });

  it('marks an open job overdue at 30 days', () => {
    expect(getServiceJobAgeState('2026-06-29', 'WAITING_FOR_PART', now)).toEqual({
      state: 'OVERDUE',
      daysOpen: 30,
    });
  });

  it('does not add an age status to terminal jobs', () => {
    expect(getServiceJobAgeState('2026-01-01', 'DELIVERED_TO_CUSTOMER', now)).toBeNull();
    expect(getServiceJobAgeState('2026-01-01', 'CANCELLED', now)).toBeNull();
  });
});
