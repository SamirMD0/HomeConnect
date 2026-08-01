import { Prisma, ServiceJobStatus } from '@prisma/client';
import { prisma } from '../../../lib/prisma';
import { OPEN_SERVICE_STATUSES, TERMINAL_SERVICE_STATUSES } from '../domain/service-status';
import { nextServiceJobNumber } from '../domain/job-number';
import { ServiceJobListQueryInput } from './service-jobs.validator';

export const serviceJobInclude = {
  customer: { select: { id: true, name: true, phone: true, isActive: true } },
  product: { select: { id: true, name: true, model: true, brand: true, barcode: true, isActive: true } },
  createdBy: { select: { id: true, fullName: true, username: true } },
  updatedBy: { select: { id: true, fullName: true, username: true } },
  cancelledBy: { select: { id: true, fullName: true, username: true } },
} satisfies Prisma.ServiceJobInclude;

export type ServiceJobRecord = Prisma.ServiceJobGetPayload<{ include: typeof serviceJobInclude }>;

export class ServiceJobsRepository {
  static findById(id: string, tx?: Prisma.TransactionClient) {
    return (tx ?? prisma).serviceJob.findUnique({ where: { id }, include: serviceJobInclude });
  }

  static async nextJobNumber(year: number, tx: Prisma.TransactionClient) {
    const latest = await tx.serviceJob.findFirst({
      where: { jobNumber: { startsWith: `SV-${year}-` } },
      orderBy: { jobNumber: 'desc' },
      select: { jobNumber: true },
    });
    return nextServiceJobNumber(year, latest?.jobNumber);
  }

  static create(data: Prisma.ServiceJobUncheckedCreateInput, tx: Prisma.TransactionClient) {
    return tx.serviceJob.create({ data, include: serviceJobInclude });
  }

  static update(id: string, data: Prisma.ServiceJobUncheckedUpdateInput, tx: Prisma.TransactionClient) {
    return tx.serviceJob.update({ where: { id }, data, include: serviceJobInclude });
  }

  static async list(query: ServiceJobListQueryInput) {
    const where = buildWhere(query);
    const orderBy = buildOrder(query.sort);
    const [items, total] = await Promise.all([
      prisma.serviceJob.findMany({
        where,
        include: serviceJobInclude,
        orderBy,
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      prisma.serviceJob.count({ where }),
    ]);
    return { items, total };
  }

  static async summary(overdueBefore: Date, monthStart: Date, nextMonthStart: Date) {
    const [groups, overdue, deliveredThisMonth] = await Promise.all([
      prisma.serviceJob.groupBy({
        by: ['status'],
        where: { status: { in: [...OPEN_SERVICE_STATUSES] } },
        _count: { _all: true },
      }),
      prisma.serviceJob.count({
        where: { status: { in: [...OPEN_SERVICE_STATUSES] }, serviceCreatedDate: { lte: overdueBefore } },
      }),
      prisma.serviceJob.count({
        where: {
          status: ServiceJobStatus.DELIVERED_TO_CUSTOMER,
          returnedToCustomerDate: { gte: monthStart, lt: nextMonthStart },
        },
      }),
    ]);
    return { groups, overdue, deliveredThisMonth };
  }
}

function buildWhere(query: ServiceJobListQueryInput): Prisma.ServiceJobWhereInput {
  const statuses = new Set(expandStatuses(query.status) ?? OPEN_SERVICE_STATUSES);
  if (query.includeDelivered) statuses.add(ServiceJobStatus.DELIVERED_TO_CUSTOMER);
  return {
    status: { in: [...statuses] },
    ...(query.customerId ? { customerId: query.customerId } : {}),
    ...(query.productId ? { productId: query.productId } : {}),
    ...(query.requestType ? { requestType: { in: query.requestType } } : {}),
    ...(query.routingDecision ? { routingDecision: { in: query.routingDecision } } : {}),
    ...(query.warrantyStatus ? { warrantyStatus: { in: query.warrantyStatus } } : {}),
    ...(query.dateFrom || query.dateTo ? { serviceCreatedDate: {
      ...(query.dateFrom ? { gte: new Date(`${query.dateFrom}T00:00:00.000Z`) } : {}),
      ...(query.dateTo ? { lte: new Date(`${query.dateTo}T00:00:00.000Z`) } : {}),
    } } : {}),
    ...(query.search ? { OR: [
      { jobNumber: { contains: query.search, mode: 'insensitive' } },
      { customer: { name: { contains: query.search, mode: 'insensitive' } } },
      { customer: { phone: { contains: query.search, mode: 'insensitive' } } },
      { product: { is: { name: { contains: query.search, mode: 'insensitive' } } } },
      { product: { is: { model: { contains: query.search, mode: 'insensitive' } } } },
      { manualProductName: { contains: query.search, mode: 'insensitive' } },
      { manualProductModel: { contains: query.search, mode: 'insensitive' } },
    ] } : {}),
  };
}

function expandStatuses(values?: string[]): ServiceJobStatus[] | undefined {
  if (!values?.length) return undefined;
  const expanded = new Set<ServiceJobStatus>();
  for (const value of values) {
    if (value === 'OPEN') OPEN_SERVICE_STATUSES.forEach((status) => expanded.add(status));
    else if (value === 'CLOSED') TERMINAL_SERVICE_STATUSES.forEach((status) => expanded.add(status));
    else expanded.add(value as ServiceJobStatus);
  }
  return [...expanded];
}

function buildOrder(sort: ServiceJobListQueryInput['sort']): Prisma.ServiceJobOrderByWithRelationInput[] {
  if (sort === 'createdAsc') return [{ serviceCreatedDate: 'asc' }, { createdAt: 'asc' }];
  if (sort === 'statusAsc') return [{ status: 'asc' }, { serviceCreatedDate: 'desc' }];
  if (sort === 'customerAsc') return [{ customer: { name: 'asc' } }, { serviceCreatedDate: 'desc' }];
  return [{ serviceCreatedDate: 'desc' }, { createdAt: 'desc' }];
}
