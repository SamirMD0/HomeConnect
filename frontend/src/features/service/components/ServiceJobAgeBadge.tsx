import React from 'react';
import { ServiceJobStatus } from '../types/service.types';
import { getServiceJobAgeState } from '../utils/service-age';

interface ServiceJobAgeBadgeProps {
  serviceCreatedDate: string;
  status: ServiceJobStatus;
}

export const ServiceJobAgeBadge: React.FC<ServiceJobAgeBadgeProps> = ({ serviceCreatedDate, status }) => {
  const age = getServiceJobAgeState(serviceCreatedDate, status);
  if (!age) return null;

  const overdue = age.state === 'OVERDUE';
  const label = overdue ? 'Overdue / متأخر' : 'Active / نشط';

  return (
    <span
      className={`mt-1 inline-flex whitespace-nowrap rounded-md px-2 py-0.5 text-xs font-semibold ${
        overdue
          ? 'border border-red-200 bg-red-50 text-red-700'
          : 'border border-emerald-200 bg-emerald-50 text-emerald-700'
      }`}
      title={`${age.daysOpen} days open / مفتوح منذ ${age.daysOpen} يوم`}
    >
      {label} · {age.daysOpen}d
    </span>
  );
};
