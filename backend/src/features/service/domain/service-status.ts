import { ServiceJobStatus } from '@prisma/client';
import { compareBusinessDates } from '../../financial/domain/business-date';
import { InvalidServiceTransitionError } from './service-errors';

export const OPEN_SERVICE_STATUSES = [
  ServiceJobStatus.RECEIVED,
  ServiceJobStatus.INSPECTION_PENDING,
  ServiceJobStatus.IN_WORKSHOP_REPAIR,
  ServiceJobStatus.SENT_TO_COMPANY,
  ServiceJobStatus.COMPANY_HOME_MAINTENANCE,
  ServiceJobStatus.WAITING_FOR_PART,
  ServiceJobStatus.WAITING_CUSTOMER_APPROVAL,
  ServiceJobStatus.READY_FOR_PICKUP,
] as const;

export const TERMINAL_SERVICE_STATUSES = [
  ServiceJobStatus.DELIVERED_TO_CUSTOMER,
  ServiceJobStatus.PRODUCT_EXCHANGE,
  ServiceJobStatus.CANCELLED,
  ServiceJobStatus.NOT_REPAIRABLE,
] as const;

const STATUS_RANK: Record<ServiceJobStatus, number> = {
  RECEIVED: 0,
  INSPECTION_PENDING: 1,
  IN_WORKSHOP_REPAIR: 2,
  SENT_TO_COMPANY: 2,
  COMPANY_HOME_MAINTENANCE: 2,
  WAITING_FOR_PART: 3,
  WAITING_CUSTOMER_APPROVAL: 3,
  READY_FOR_PICKUP: 4,
  DELIVERED_TO_CUSTOMER: 5,
  PRODUCT_EXCHANGE: 5,
  NOT_REPAIRABLE: 5,
  CANCELLED: 5,
};

export interface ServiceDateValues {
  serviceCreatedDate: string;
  sentToCompanyDate?: string | null;
  receivedFromCompanyDate?: string | null;
  returnedToCustomerDate?: string | null;
}

export function isTerminalServiceStatus(status: ServiceJobStatus): boolean {
  return TERMINAL_SERVICE_STATUSES.includes(status as (typeof TERMINAL_SERVICE_STATUSES)[number]);
}

export function isOpenServiceStatus(status: ServiceJobStatus): boolean {
  return OPEN_SERVICE_STATUSES.includes(status as (typeof OPEN_SERVICE_STATUSES)[number]);
}

export function assertStatusTransitionAllowed(current: ServiceJobStatus, target: ServiceJobStatus): void {
  if (current === target) throw new InvalidServiceTransitionError('Service job already has this status');
  if (isTerminalServiceStatus(current)) {
    throw new InvalidServiceTransitionError('Final service jobs must use the reopen action');
  }
}

export function isRoutineForwardTransition(current: ServiceJobStatus, target: ServiceJobStatus): boolean {
  if (isTerminalServiceStatus(target)) return false;
  return STATUS_RANK[target] >= STATUS_RANK[current];
}

export function requiredDateForTransition(
  current: ServiceJobStatus,
  target: ServiceJobStatus
): keyof ServiceDateValues | null {
  if (target === ServiceJobStatus.SENT_TO_COMPANY) return 'sentToCompanyDate';
  if (
    current === ServiceJobStatus.SENT_TO_COMPANY &&
    (target === ServiceJobStatus.IN_WORKSHOP_REPAIR || target === ServiceJobStatus.READY_FOR_PICKUP)
  ) {
    return 'receivedFromCompanyDate';
  }
  if (target === ServiceJobStatus.DELIVERED_TO_CUSTOMER || target === ServiceJobStatus.PRODUCT_EXCHANGE) {
    return 'returnedToCustomerDate';
  }
  return null;
}

export function assertServiceDateOrder(values: ServiceDateValues): void {
  const ordered = [
    ['serviceCreatedDate', values.serviceCreatedDate],
    ['sentToCompanyDate', values.sentToCompanyDate],
    ['receivedFromCompanyDate', values.receivedFromCompanyDate],
    ['returnedToCustomerDate', values.returnedToCustomerDate],
  ].filter((entry): entry is [string, string] => Boolean(entry[1]));

  for (let index = 1; index < ordered.length; index += 1) {
    if (compareBusinessDates(ordered[index - 1][1], ordered[index][1]) > 0) {
      throw new InvalidServiceTransitionError(
        `${ordered[index][0]} cannot be earlier than ${ordered[index - 1][0]}`
      );
    }
  }
}
