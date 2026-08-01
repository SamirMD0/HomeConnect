import { ServiceJobStatus } from '../types/service.types';
export const FINAL_SERVICE_STATUSES: ServiceJobStatus[] = ['DELIVERED_TO_CUSTOMER','CANCELLED','NOT_REPAIRABLE'];
export function serviceStatusTone(status: ServiceJobStatus) {
  if (status === 'CANCELLED' || status === 'NOT_REPAIRABLE') return 'red';
  if (status === 'DELIVERED_TO_CUSTOMER' || status === 'READY_FOR_PICKUP') return 'green';
  if (status === 'SENT_TO_COMPANY' || status === 'WAITING_FOR_PART') return 'amber';
  return 'blue';
}
