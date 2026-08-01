import { ServiceJobStatus } from '../types/service.types';
import { FINAL_SERVICE_STATUSES } from './service-status';

const MILLISECONDS_PER_DAY = 24 * 60 * 60 * 1000;
export const SERVICE_JOB_OVERDUE_DAYS = 30;

export type ServiceJobAgeState = {
  state: 'ACTIVE' | 'OVERDUE';
  daysOpen: number;
};

export function getServiceJobAgeState(
  serviceCreatedDate: string,
  status: ServiceJobStatus,
  now = new Date(),
): ServiceJobAgeState | null {
  if (FINAL_SERVICE_STATUSES.includes(status)) return null;

  const [year, month, day] = serviceCreatedDate.split('-').map(Number);
  if (!year || !month || !day) return { state: 'ACTIVE', daysOpen: 0 };

  const createdAt = Date.UTC(year, month - 1, day);
  const today = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  const daysOpen = Math.max(0, Math.floor((today - createdAt) / MILLISECONDS_PER_DAY));

  return {
    state: daysOpen >= SERVICE_JOB_OVERDUE_DAYS ? 'OVERDUE' : 'ACTIVE',
    daysOpen,
  };
}
