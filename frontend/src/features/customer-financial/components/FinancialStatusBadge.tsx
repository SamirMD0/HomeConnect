import React from 'react';
import {
  debtStatusLabels,
  getBadgeToneClass,
  installmentStatusLabels,
  planStatusLabels,
  StatusBadgeConfig,
} from '../utils/financial-labels';
import {
  DebtStatus,
  InstallmentPlanStatus,
  InstallmentStatus,
} from '../types/customer-financial.types';

interface FinancialStatusBadgeProps {
  status: DebtStatus | InstallmentPlanStatus | InstallmentStatus;
  type: 'debt' | 'plan' | 'installment';
}

export const FinancialStatusBadge: React.FC<FinancialStatusBadgeProps> = ({ status, type }) => {
  const config = getStatusConfig(status, type);

  return (
    <span
      className={`inline-flex items-center rounded-md px-2 py-1 text-xs font-medium ring-1 ring-inset ${getBadgeToneClass(config.tone)}`}
    >
      {config.label}
    </span>
  );
};

function getStatusConfig(
  status: DebtStatus | InstallmentPlanStatus | InstallmentStatus,
  type: FinancialStatusBadgeProps['type']
): StatusBadgeConfig {
  if (type === 'debt') return debtStatusLabels[status as DebtStatus];
  if (type === 'plan') return planStatusLabels[status as InstallmentPlanStatus];
  return installmentStatusLabels[status as InstallmentStatus];
}
