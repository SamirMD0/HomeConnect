import { CorrectionAuditRepository } from '../corrections/correction-audit.repository';
import { CustomerFinancialSummaryService } from './customer-financial-summary.service';

export interface CustomerActivityItem {
  id: string; type: 'DEBT_CREATED' | 'PLAN_CREATED' | 'PAYMENT_RECORDED' | 'CORRECTION';
  at: string; label: string; amount: string | null; actor: string | null; recordId: string;
}

export class CustomerActivityService {
  static async list(customerId: string, limit = 50): Promise<CustomerActivityItem[]> {
    const [summary, corrections] = await Promise.all([
      CustomerFinancialSummaryService.getCustomerFinancialSummary(customerId, {
        includeCancelled: true, includePayments: true, paymentLimit: 100, debtLimit: 100, planLimit: 100,
      }),
      CorrectionAuditRepository.listCorrectionAudits({ customerId }),
    ]);
    return [
      ...summary.debts.map((debt) => ({ id: `debt-${debt.id}`, type: 'DEBT_CREATED' as const, at: debt.createdAt, label: 'Debt created / تمت إضافة دين', amount: debt.originalAmount, actor: debt.createdBy.name, recordId: debt.id })),
      ...summary.installmentPlans.map((plan) => ({ id: `plan-${plan.id}`, type: 'PLAN_CREATED' as const, at: plan.createdAt, label: 'Installment plan created / تمت إضافة خطة تقسيط', amount: plan.totalAmount, actor: plan.createdBy.name, recordId: plan.id })),
      ...summary.recentPayments.map((payment) => ({ id: `payment-${payment.id}`, type: 'PAYMENT_RECORDED' as const, at: payment.createdAt, label: payment.voidedAt ? 'Payment voided / أُلغيت الدفعة' : 'Payment recorded / تم تسجيل دفعة', amount: payment.totalAmount, actor: payment.createdBy.name, recordId: payment.id })),
      ...corrections.map((audit) => ({ id: `correction-${audit.id}`, type: 'CORRECTION' as const, at: audit.correctedAt.toISOString(), label: `Correction: ${audit.action}`, amount: null, actor: audit.correctedByName, recordId: audit.recordId })),
    ].sort((a, b) => b.at.localeCompare(a.at)).slice(0, Math.min(limit, 100));
  }
}
