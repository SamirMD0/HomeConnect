import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { CreateDebtForm } from '../../features/customer-financial/components/CreateDebtForm';
import { CreateInstallmentPlanForm } from '../../features/customer-financial/components/CreateInstallmentPlanForm';
import { RecordDebtPaymentDialog } from '../../features/customer-financial/components/RecordDebtPaymentDialog';
import { RecordPlanPaymentDialog } from '../../features/customer-financial/components/RecordPlanPaymentDialog';
import { createDebtSchema } from '../../features/customer-financial/schemas/financial-mutation.schemas';

const customer = {
  id: 'customer-1',
  name: 'علي أحمد',
  phone: '70123456',
  address: null,
  notes: null,
  isActive: true,
};

function renderWithQueryClient(node: ReactNode): string {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return renderToStaticMarkup(
    <QueryClientProvider client={queryClient}>{node}</QueryClientProvider>
  );
}

describe('business workflow Arabic labels', () => {
  it('renders bilingual debt and installment-plan form labels', () => {
    const debtHtml = renderWithQueryClient(
      <CreateDebtForm customer={customer} onBack={() => undefined} onSuccess={() => undefined} />
    );
    const planHtml = renderWithQueryClient(
      <CreateInstallmentPlanForm customer={customer} onBack={() => undefined} onSuccess={() => undefined} />
    );

    expect(debtHtml).toContain('Amount / المبلغ');
    expect(debtHtml).toContain('Due Date / تاريخ الاستحقاق');
    expect(debtHtml).toContain('Create Debt / إضافة دين');
    expect(planHtml).toContain('Number of Installments / عدد الأقساط');
    expect(planHtml).toContain('Create Installment Plan / إنشاء خطة تقسيط');
  });

  it('renders bilingual debt and installment payment labels', () => {
    const debtHtml = renderWithQueryClient(
      <RecordDebtPaymentDialog
        customerId="customer-1"
        debt={{
          id: 'debt-1',
          description: 'براد',
          originalAmount: '300.00',
          totalPaid: '50.00',
          remainingBalance: '250.00',
          dueDate: '2026-08-30',
          calculatedStatus: 'PARTIALLY_PAID',
        }}
        onSuccess={() => undefined}
      />
    );
    const planHtml = renderWithQueryClient(
      <RecordPlanPaymentDialog
        customerId="customer-1"
        plan={{
          id: 'plan-1',
          description: 'غسالة',
          totalAmount: '600.00',
          totalPaid: '100.00',
          remainingBalance: '500.00',
          nextDueDate: '2026-08-30',
          calculatedStatus: 'ACTIVE',
        }}
        onSuccess={() => undefined}
      />
    );

    for (const html of [debtHtml, planHtml]) {
      expect(html).toContain('Payment Date / تاريخ الدفعة');
      expect(html).toContain('Payment Method / طريقة الدفع');
      expect(html).toContain('Record Payment / تسجيل دفعة');
      expect(html).toContain('dir="auto"');
    }
  });

  it('uses the bilingual amount-required validation message', () => {
    const result = createDebtSchema.safeParse({
      amount: '',
      description: '',
      dueDate: '',
      notes: '',
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.map((issue) => issue.message)).toContain(
        'Amount is required / المبلغ مطلوب'
      );
    }
  });
});
