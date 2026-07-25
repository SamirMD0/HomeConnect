import { Role } from '@prisma/client';
import { AuthorizationError } from '../../../lib/errors';
import { requireRole } from '../../../middleware/role.middleware';
import { FinancialMutationAction, FinancialMutationUser } from '../domain/financial-types';

export const ADMIN_FINANCIAL_MUTATION_ACTIONS: FinancialMutationAction[] = [
  'create_debt',
  'create_installment_plan',
  'record_payment',
  'cancel_debt',
  'cancel_installment_plan',
  'void_payment',
];

export const requireFinancialAdmin = requireRole([Role.ADMIN]);

export function assertCanPerformFinancialMutation(
  user: FinancialMutationUser | undefined,
  action: FinancialMutationAction
): void {
  if (!ADMIN_FINANCIAL_MUTATION_ACTIONS.includes(action)) {
    throw new AuthorizationError('Unknown financial mutation action');
  }

  if (!user) {
    throw new AuthorizationError('User not authenticated');
  }

  if (user.role !== Role.ADMIN) {
    throw new AuthorizationError('Only administrators can perform financial mutations');
  }
}
