import type { Prisma } from '@prisma/client';
import { prisma } from '../../../lib/prisma';

const include = {
  customer: { select: { id: true, name: true } },
} satisfies Prisma.ServiceJobInclude;

export type ServiceAnalyticsJob = Prisma.ServiceJobGetPayload<{ include: typeof include }>;

export class ServiceAnalyticsRepository {
  static load(): Promise<ServiceAnalyticsJob[]> {
    return prisma.serviceJob.findMany({
      include,
      orderBy: [{ serviceCreatedDate: 'asc' }, { id: 'asc' }],
    });
  }
}

