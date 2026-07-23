import React from 'react';
import { useCustomerBalance } from '../../../features/transactions/hooks/useTransactions';
import { BalanceBadge } from '../../../components/ui/BalanceBadge';

interface CustomerBalanceCellProps {
  customerId: string;
}

export const CustomerBalanceCell: React.FC<CustomerBalanceCellProps> = ({ customerId }) => {
  const { data, isLoading } = useCustomerBalance(customerId);

  if (isLoading) {
    return <span className="text-slate-400 text-sm">Loading...</span>;
  }

  const balance = data?.data?.balance || 0;

  return <BalanceBadge balance={balance} />;
};
