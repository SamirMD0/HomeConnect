import { useDebtDetail, useInstallmentPlanDetail } from '../../customer-financial/hooks/useCustomerFinancialSummary';
import { RecentFinancialPayment } from '../../customer-financial/types/customer-financial.types';
import {
  FinancialLedgerDebtItem,
  FinancialLedgerPlanItem,
} from '../types/financial-ledger.types';

export function useLedgerRowPayments(
  item: FinancialLedgerDebtItem | FinancialLedgerPlanItem,
  enabled: boolean
): {
  payments: RecentFinancialPayment[];
  isLoading: boolean;
  isError: boolean;
  refetch: () => void;
} {
  const debtQuery = useDebtDetail(enabled && item.type === 'DEBT' ? item.id : null);
  const planQuery = useInstallmentPlanDetail(enabled && item.type === 'INSTALLMENT_PLAN' ? item.id : null);
  const activeQuery = item.type === 'DEBT' ? debtQuery : planQuery;

  return {
    payments: activeQuery.data?.payments ?? [],
    isLoading: activeQuery.isLoading,
    isError: activeQuery.isError,
    refetch: () => {
      void activeQuery.refetch();
    },
  };
}
