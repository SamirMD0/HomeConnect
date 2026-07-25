import { Role } from '@prisma/client';
import { describe, expect, it } from 'vitest';
import { AuthorizationError } from '../../../lib/errors';
import { assertCanPerformFinancialMutation } from './financial-policy';

describe('financial authorization policy', () => {
  it('allows admins to perform financial mutations', () => {
    expect(() =>
      assertCanPerformFinancialMutation({ userId: 'admin-id', role: Role.ADMIN }, 'record_payment')
    ).not.toThrow();
  });

  it('rejects employees for financial mutations', () => {
    expect(() =>
      assertCanPerformFinancialMutation({ userId: 'employee-id', role: Role.EMPLOYEE }, 'record_payment')
    ).toThrow(AuthorizationError);
  });
});
