import React from 'react';
import { ReceivableTier } from '../types/receivables.types';
import { getReceivableTierStyle } from '../utils/receivables-tier';

interface StandingChipProps {
  tier: ReceivableTier;
  reason?: string;
}

export const StandingChip: React.FC<StandingChipProps> = ({ tier, reason }) => {
  const style = getReceivableTierStyle(tier);

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium ring-1 ring-inset ${style.chipClass}`}
      title={reason}
      aria-label={reason ? `${style.label}. ${reason}` : style.label}
    >
      <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${style.dotClass}`} aria-hidden="true" />
      {style.label}
    </span>
  );
};
