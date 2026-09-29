import { Currency, Prisma } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
import { AppError, AuthorizationError, ValidationError } from '../../../lib/errors';
import { verifyAdminPassword } from '../../../lib/admin-verification';
import { CustomerFinancialSummaryService } from '../customer-summary/customer-financial-summary.service';
import { customerFinancialSummaryQuerySchema } from '../customer-summary/customer-financial-summary.validator';
import { moneyToApiString, parseMoney } from '../domain/money';

export interface CreditLimitOverrideInput {
  overrideCreditLimit?: boolean;
  creditLimitOverrideReason?: string | null;
  accountPassword?: string;
}
interface Actor { userId: string; role: string }
interface Projection {
  currency: 'USD'; currentOutstanding: string; creditLimit: string;
  projectedOutstanding: string; overage: string;
}
type OverrideDecision = (Projection & { reason: string }) | null;

export class CreditLimitService {
  static async check(
    tx: Prisma.TransactionClient,
    customer: { id: string; creditLimit?: Decimal | null },
    newBaseDebt: Decimal,
    input: CreditLimitOverrideInput,
    user: Actor
  ): Promise<OverrideDecision> {
    if (customer.creditLimit == null) return null;
    // This is the SAME lifetime calculation shown on the customer profile,
    // including original base snapshots, non-void allocations and return credits.
    const summary = await CustomerFinancialSummaryService.getCustomerFinancialSummary(
      customer.id, customerFinancialSummaryQuerySchema.parse({ includePayments: 'false' }), tx
    );
    const outstanding = parseMoney(summary.summary.totalOutstanding, Currency.USD);
    const projected = outstanding.plus(newBaseDebt);
    if (projected.lessThanOrEqualTo(customer.creditLimit)) return null;
    const projection: Projection = {
      currency: 'USD', currentOutstanding: moneyToApiString(outstanding),
      creditLimit: moneyToApiString(customer.creditLimit), projectedOutstanding: moneyToApiString(projected),
      overage: moneyToApiString(projected.minus(customer.creditLimit)),
    };
    if (!input.overrideCreditLimit) throw new AppError(
      'Credit limit exceeded / تم تجاوز حد الائتمان. An ADMIN override is required.',
      409, 'CREDIT_LIMIT_EXCEEDED', projection
    );
    if (user.role !== 'ADMIN') throw new AuthorizationError('Only an ADMIN can override a customer credit limit');
    const reason = input.creditLimitOverrideReason?.trim();
    if (!reason || reason.length < 5 || !input.accountPassword) throw new ValidationError('ADMIN password and a credit-limit override reason (at least 5 characters) are required');
    await verifyAdminPassword(user.userId, input.accountPassword, {
      action: 'OVERRIDE_CUSTOMER_CREDIT_LIMIT', recordType: 'Customer', recordId: customer.id,
      domainLabel: 'customer credit-limit overrides',
    }, tx);
    return { ...projection, reason };
  }

  static async audit(tx: Prisma.TransactionClient, customerId: string, debtId: string, decision: OverrideDecision, user: Actor): Promise<void> {
    if (!decision) return;
    await tx.activityLog.create({ data: {
      userId: user.userId, action: 'CREDIT_LIMIT_OVERRIDE', entityType: 'Debt', entityId: debtId,
      details: { customerId, debtId, ...decision },
    } });
  }
}
