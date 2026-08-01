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
  const englishLabel = overdue ? 'Overdue' : 'Active';
  const arabicLabel = overdue ? 'متأخر' : 'نشط';

  return (
    <span
      dir="ltr"
      className={`mt-1 inline-flex items-center gap-1 whitespace-nowrap rounded-md px-2 py-0.5 text-[11px] font-semibold leading-4 ${
        overdue
          ? 'border border-red-200 bg-red-50 text-red-700'
          : 'border border-emerald-200 bg-emerald-50 text-emerald-700'
      }`}
      title={`${age.daysOpen} days open | مفتوح منذ ${age.daysOpen} يوم`}
    >
      <span>{englishLabel}</span>
      <span aria-hidden="true">·</span>
      <span>{age.daysOpen}d</span>
      <span aria-hidden="true" className="font-normal opacity-60">/</span>
      <span dir="rtl">{arabicLabel}</span>
    </span>
  );
};
