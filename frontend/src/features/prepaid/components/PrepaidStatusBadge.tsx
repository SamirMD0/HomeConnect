import React from 'react';
import { PrepaidStatus } from '../types/prepaid.types';
import { prepaidStatusLabels, prepaidStatusTone } from '../utils/prepaid-labels';

interface PrepaidStatusBadgeProps {
  status: PrepaidStatus;
}

export const PrepaidStatusBadge: React.FC<PrepaidStatusBadgeProps> = ({ status }) => (
  <span
    className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ring-inset ${prepaidStatusTone[status]}`}
  >
    {prepaidStatusLabels[status]}
  </span>
);
