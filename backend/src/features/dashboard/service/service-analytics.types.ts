import type { ServiceJobStatus } from '@prisma/client';

export interface ServiceStatusPoint {
  status: ServiceJobStatus;
  label: string;
  count: number;
}

export interface ServiceThroughputPoint {
  bucket: string;
  opened: number;
  completed: number;
}

export interface ServiceAgingJob {
  id: string;
  jobNumber: string;
  customerName: string;
  status: ServiceJobStatus;
  ageDays: number;
}

export interface ServiceAnalyticsData {
  totals: {
    all: number;
    open: number;
    readyForPickup: number;
    completed: number;
    aging: number;
  };
  statusDistribution: ServiceStatusPoint[];
  throughput: ServiceThroughputPoint[];
  agingJobs: ServiceAgingJob[];
}

