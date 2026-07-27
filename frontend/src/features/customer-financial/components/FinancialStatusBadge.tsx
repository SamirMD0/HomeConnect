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
  status: DebtStatus | InstallmentPlanStatus | InstallmentStatus | null | undefined;
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
  status: FinancialStatusBadgeProps['status'],
  type: FinancialStatusBadgeProps['type']
): StatusBadgeConfig {
  if (!status) return fallbackStatusConfig(status);
  if (type === 'debt') return debtStatusLabels[status as DebtStatus] ?? fallbackStatusConfig(status);
  if (type === 'plan') return planStatusLabels[status as InstallmentPlanStatus] ?? fallbackStatusConfig(status);
  return installmentStatusLabels[status as InstallmentStatus] ?? fallbackStatusConfig(status);
}

function fallbackStatusConfig(status: string | null | undefined): StatusBadgeConfig {
  if (!status) {
    return {
      label: 'Unknown',
      tone: 'slate',
    };
  }

  return {
    label: status
      .toLowerCase()
      .split('_')
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(' '),
    tone: 'slate',
  };
}
