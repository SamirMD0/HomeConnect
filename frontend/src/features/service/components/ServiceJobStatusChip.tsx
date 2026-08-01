import React from 'react';
import { ServiceJobStatus } from '../types/service.types';
import { STATUS_LABELS } from '../utils/service-labels';
import { serviceStatusTone } from '../utils/service-status';

const styles = { green: 'border-emerald-200 bg-emerald-50 text-emerald-800', red: 'border-red-200 bg-red-50 text-red-800', amber: 'border-amber-200 bg-amber-50 text-amber-800', blue: 'border-blue-200 bg-blue-50 text-blue-800' };
export const ServiceJobStatusChip: React.FC<{ status: ServiceJobStatus }> = ({ status }) => (
  <span className={`inline-flex rounded-md border px-2 py-1 text-xs font-semibold ${styles[serviceStatusTone(status)]}`}>{STATUS_LABELS[status]}</span>
);
