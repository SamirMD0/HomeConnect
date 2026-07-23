import React from 'react';

interface BalanceBadgeProps {
  balance: number;
}

export const BalanceBadge: React.FC<BalanceBadgeProps> = ({ balance }) => {
  const isDebt = balance > 0;
  const isCredit = balance < 0; // if overpaid

  const formattedBalance = Math.abs(balance).toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
  });

  if (isDebt) {
    return (
      <span className="inline-flex items-center rounded-md bg-red-50 px-2 py-1 text-xs font-medium text-red-700 ring-1 ring-inset ring-red-600/10">
        Debt: {formattedBalance}
      </span>
    );
  }

  if (isCredit) {
    return (
      <span className="inline-flex items-center rounded-md bg-blue-50 px-2 py-1 text-xs font-medium text-blue-700 ring-1 ring-inset ring-blue-700/10">
        Credit: {formattedBalance}
      </span>
    );
  }

  return (
    <span className="inline-flex items-center rounded-md bg-green-50 px-2 py-1 text-xs font-medium text-green-700 ring-1 ring-inset ring-green-600/20">
      Settled
    </span>
  );
};
