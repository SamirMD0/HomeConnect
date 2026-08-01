import { ServiceJobStatus } from '@prisma/client';
import { prismaDateToBusinessDate, todayInBusinessTimezone } from '../../financial';
import { DASHBOARD_ALERT_THRESHOLDS, DASHBOARD_TOP_RECORD_LIMIT } from '../dashboard.config';
import type { ResolvedDashboardRange } from '../dashboard.types';
import { addDays, differenceInDays } from '../shared/dashboard-range';
import { ServiceAnalyticsRepository, type ServiceAnalyticsJob } from './service-analytics.repository';
import type { ServiceAnalyticsData } from './service-analytics.types';

export const SERVICE_STATUS_ORDER = Object.values(ServiceJobStatus);
const TERMINAL_STATUSES = new Set<ServiceJobStatus>([
  ServiceJobStatus.DELIVERED_TO_CUSTOMER,
  ServiceJobStatus.CANCELLED,
  ServiceJobStatus.NOT_REPAIRABLE,
]);

export class ServiceAnalyticsService {
  static async get(
    range: ResolvedDashboardRange,
    businessDate = todayInBusinessTimezone()
  ): Promise<ServiceAnalyticsData> {
    return this.aggregate(await ServiceAnalyticsRepository.load(), range, businessDate);
  }

  static aggregate(
    jobs: ServiceAnalyticsJob[],
    range: ResolvedDashboardRange,
    businessDate: string
  ): ServiceAnalyticsData {
    const open = jobs.filter((job) => !TERMINAL_STATUSES.has(job.status));
    const completed = jobs.filter(
      (job) =>
        Boolean(job.completedAt) &&
        inRange(job.completedAt!.toISOString().slice(0, 10), range.from, range.to)
    );
    const aging = open.filter(
      (job) => differenceInDays(prismaDateToBusinessDate(job.serviceCreatedDate), businessDate) > DASHBOARD_ALERT_THRESHOLDS.agingServiceJobDays
    );

    return {
      totals: {
        all: jobs.length,
        open: open.length,
        readyForPickup: jobs.filter((job) => job.status === ServiceJobStatus.READY_FOR_PICKUP).length,
        completed: completed.length,
        aging: aging.length,
      },
      statusDistribution: SERVICE_STATUS_ORDER.map((status) => ({
        status,
        label: statusLabel(status),
        count: jobs.filter((job) => job.status === status).length,
      })),
      throughput: bucketKeys(range).map((bucket) => ({
        bucket,
        opened: jobs.filter(
          (job) => bucketFor(prismaDateToBusinessDate(job.serviceCreatedDate), range.granularity) === bucket
        ).length,
        completed: completed.filter(
          (job) => bucketFor(job.completedAt!.toISOString().slice(0, 10), range.granularity) === bucket
        ).length,
      })),
      agingJobs: aging
        .map((job) => ({
          id: job.id,
          jobNumber: job.jobNumber,
          customerName: job.customer.name,
          status: job.status,
          ageDays: differenceInDays(prismaDateToBusinessDate(job.serviceCreatedDate), businessDate),
        }))
        .sort((left, right) => right.ageDays - left.ageDays || left.jobNumber.localeCompare(right.jobNumber))
        .slice(0, DASHBOARD_TOP_RECORD_LIMIT),
    };
  }
}

export function isTerminalServiceStatus(status: ServiceJobStatus): boolean {
  return TERMINAL_STATUSES.has(status);
}

function statusLabel(status: ServiceJobStatus): string {
  return status.toLowerCase().split('_').map((part) => `${part[0]?.toUpperCase() ?? ''}${part.slice(1)}`).join(' ');
}

function bucketKeys(range: ResolvedDashboardRange): string[] {
  const values: string[] = [];
  for (let cursor = range.from; cursor <= range.to; cursor = addDays(cursor, 1)) {
    const bucket = bucketFor(cursor, range.granularity);
    if (values.at(-1) !== bucket) values.push(bucket);
  }
  return values;
}

function bucketFor(date: string, granularity: ResolvedDashboardRange['granularity']): string {
  if (granularity === 'day') return date;
  if (granularity === 'month') return date.slice(0, 7);
  const weekday = new Date(`${date}T00:00:00Z`).getUTCDay();
  return addDays(date, -(weekday === 0 ? 6 : weekday - 1));
}

function inRange(value: string, from: string, to: string): boolean {
  return value >= from && value <= to;
}

