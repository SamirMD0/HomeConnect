import React from 'react';
import { ArrowDownRight, ArrowUpRight, Check } from 'lucide-react';
import { Badge } from './Badge';

interface BalanceBadgeProps {
  balance: number;
}

/**
 * Customer balance state.
 *
 * NOTE: the currency here is hardcoded to USD and the balance arrives as a
 * `number`, which does not match the decimal-string money convention used on
 * the backend. Both are pre-existing and deliberately left unchanged — money
 * display is a business decision, not a styling one. See the UI plan (R8).
 */
export const BalanceBadge: React.FC<BalanceBadgeProps> = ({ balance }) => {
  const formattedBalance = Math.abs(balance).toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
  });

  if (balance > 0) {
    return (
      <Badge tone="danger" icon={<ArrowUpRight />}>
        Debt: {formattedBalance}
      </Badge>
    );
  }

  if (balance < 0) {
    return (
      <Badge tone="info" icon={<ArrowDownRight />}>
        Credit: {formattedBalance}
      </Badge>
    );
  }

  return (
    <Badge tone="success" icon={<Check />}>
      Settled
    </Badge>
  );
};
