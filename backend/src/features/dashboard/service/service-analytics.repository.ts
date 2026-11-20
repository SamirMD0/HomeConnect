import { scopeWhere, type BranchScope } from '../../branches/branch-scope';
import type { Prisma } from '@prisma/client';
import { prisma } from '../../../lib/prisma';
import { scopeKey, sharedLoad } from '../shared/shared-load';

const include = {
  customer: { select: { id: true, name: true } },
} satisfies Prisma.ServiceJobInclude;

export type ServiceAnalyticsJob = Prisma.ServiceJobGetPayload<{ include: typeof include }>;

export class ServiceAnalyticsRepository {
  static load(scope: BranchScope): Promise<ServiceAnalyticsJob[]> {
    return sharedLoad('service-analytics', [scopeKey(scope)], () =>
      prisma.serviceJob.findMany({ where: scopeWhere(scope),
        include,
        orderBy: [{ serviceCreatedDate: 'asc' }, { id: 'asc' }],
      })
    );
  }
}

