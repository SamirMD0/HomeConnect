import { Decimal } from '@prisma/client/runtime/library';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { summary, verify } = vi.hoisted(() => ({ summary: vi.fn(), verify: vi.fn() }));
vi.mock('../customer-summary/customer-financial-summary.service', () => ({ CustomerFinancialSummaryService: { getCustomerFinancialSummary: summary } }));
vi.mock('../../../lib/admin-verification', () => ({ verifyAdminPassword: verify }));
import { CreditLimitService } from './credit-limit.service';

describe('derived customer credit-limit enforcement', () => {
  const user = { userId: '11111111-1111-4111-8111-111111111111', role: 'ADMIN' };
  const customer = { id: '22222222-2222-4222-8222-222222222222', creditLimit: new Decimal('100') };
  const tx = { activityLog: { create: vi.fn() } } as never;
  beforeEach(() => { vi.clearAllMocks(); summary.mockResolvedValue({ summary: { totalOutstanding: '70.00' } }); verify.mockResolvedValue(undefined); });

  it('leaves null limits unrestricted without loading financial records', async () => {
    expect(await CreditLimitService.check(tx, { ...customer, creditLimit: null }, new Decimal('100000'), {}, user)).toBeNull();
    expect(summary).not.toHaveBeenCalled(); expect(verify).not.toHaveBeenCalled();
  });
  it('uses the caller transaction and allows the exact limit', async () => {
    expect(await CreditLimitService.check(tx, customer, new Decimal('30'), {}, user)).toBeNull();
    expect(summary).toHaveBeenCalledWith(customer.id, expect.objectContaining({ includeCancelled: false, includePayments: false }), tx);
  });
  it('returns server-computed warning values when projected outstanding exceeds the limit', async () => {
    await expect(CreditLimitService.check(tx, customer, new Decimal('31'), {}, user)).rejects.toMatchObject({
      statusCode: 409, code: 'CREDIT_LIMIT_EXCEEDED', details: { currency: 'USD', currentOutstanding: '70.00', creditLimit: '100.00', projectedOutstanding: '101.00', overage: '1.00' },
    });
  });
  it('does not trust a cached or client-supplied outstanding figure', async () => {
    summary.mockResolvedValue({ summary: { totalOutstanding: '100.00' } });
    await expect(CreditLimitService.check(tx, customer, new Decimal('1'), {}, user)).rejects.toMatchObject({ code: 'CREDIT_LIMIT_EXCEEDED' });
  });
  it('does not let an employee override, even with a password', async () => {
    await expect(CreditLimitService.check(tx, customer, new Decimal('31'), { overrideCreditLimit: true, creditLimitOverrideReason: 'Approved exception', accountPassword: 'secret' }, { ...user, role: 'EMPLOYEE' })).rejects.toMatchObject({ statusCode: 403 });
    expect(verify).not.toHaveBeenCalled();
  });
  it('requires a reason and successful ADMIN step-up before permitting an override', async () => {
    await expect(CreditLimitService.check(tx, customer, new Decimal('31'), { overrideCreditLimit: true, accountPassword: 'secret' }, user)).rejects.toMatchObject({ statusCode: 400 });
    verify.mockRejectedValueOnce(new Error('wrong password'));
    await expect(CreditLimitService.check(tx, customer, new Decimal('31'), { overrideCreditLimit: true, creditLimitOverrideReason: 'Approved exception', accountPassword: 'secret' }, user)).rejects.toThrow('wrong password');
  });
  it('audits the exact derived projection and reason without storing the password', async () => {
    const decision = await CreditLimitService.check(tx, customer, new Decimal('31'), { overrideCreditLimit: true, creditLimitOverrideReason: 'Approved exception', accountPassword: 'secret' }, user);
    await CreditLimitService.audit(tx, customer.id, 'debt-id', decision, user);
    expect(verify).toHaveBeenCalledWith(user.userId, 'secret', expect.objectContaining({ action: 'OVERRIDE_CUSTOMER_CREDIT_LIMIT' }), tx);
    expect((tx as unknown as { activityLog: { create: ReturnType<typeof vi.fn> } }).activityLog.create).toHaveBeenCalledWith({ data: expect.objectContaining({
      action: 'CREDIT_LIMIT_OVERRIDE', entityType: 'Debt', entityId: 'debt-id', userId: user.userId,
      details: expect.objectContaining({ customerId: customer.id, reason: 'Approved exception', currentOutstanding: '70.00', projectedOutstanding: '101.00', overage: '1.00' }),
    }) });
    expect(JSON.stringify(decision)).not.toContain('secret');
  });
});
