import { moneyToApiString } from '../../financial';
import { DashboardActivityRepository, type DashboardActivityRecords } from './dashboard-activity.repository';
import type { DashboardActivityData, DashboardActivityItem } from './dashboard-activity.types';

interface LegacyActivityRow {
  id: string;
  entityType: string;
  entityId: string;
  action: string;
  createdAt: Date;
  user?: { fullName: string } | null;
}

export class DashboardActivityService {
  static async get(limit = 15): Promise<DashboardActivityData> {
    return this.aggregate(await DashboardActivityRepository.load(limit), limit);
  }

  static aggregate(records: DashboardActivityRecords, limit = 15): DashboardActivityData {
    const items: DashboardActivityItem[] = [
      ...(records.legacy as LegacyActivityRow[]).map((row) => ({ id: `legacy:${row.id}`, module: moduleForEntity(row.entityType), action: row.action, entityId: row.entityId, title: legacyTitle(row.action, row.entityType), occurredAt: row.createdAt.toISOString(), actor: row.user?.fullName ?? 'System', route: routeFor(moduleForEntity(row.entityType), row.entityId) })),
      ...records.payments.map((row) => ({ id: `payment:${row.id}`, module: 'payments' as const, action: 'PAYMENT_RECORDED', entityId: row.id, title: `Payment recorded for ${row.customer.name}`, amount: moneyToApiString(row.totalAmount), occurredAt: row.createdAt.toISOString(), actor: row.createdBy.fullName, route: '/ledger?view=payments' })),
      ...records.debts.map((row) => ({ id: `debt:${row.id}`, module: 'debts' as const, action: 'DEBT_CREATED', entityId: row.id, title: `Debt created for ${row.customer.name}`, amount: moneyToApiString(row.originalAmount), occurredAt: row.createdAt.toISOString(), actor: row.createdBy.fullName, route: `/customers/${row.customerId}` })),
      ...records.plans.map((row) => ({ id: `plan:${row.id}`, module: 'debts' as const, action: 'PLAN_CREATED', entityId: row.id, title: `Installment plan created for ${row.customer.name}`, amount: moneyToApiString(row.totalAmount), occurredAt: row.createdAt.toISOString(), actor: row.createdBy.fullName, route: `/customers/${row.customerId}` })),
      ...records.supplierTransactions.map((row) => ({ id: `supplier:${row.id}`, module: 'suppliers' as const, action: 'SUPPLIER_TRANSACTION_ADDED', entityId: row.id, title: `Supplier transaction added for ${row.supplier.name}`, amount: moneyToApiString(row.amount), occurredAt: row.createdAt.toISOString(), actor: row.createdBy.fullName, route: `/suppliers/${row.supplierId}` })),
      ...records.serviceJobs.map((row) => ({ id: `service:${row.id}`, module: 'service' as const, action: 'SERVICE_JOB_CREATED', entityId: row.id, title: `Service job ${row.jobNumber} created for ${row.customer.name}`, occurredAt: row.createdAt.toISOString(), actor: row.createdBy.fullName, route: `/service/${row.id}` })),
      ...records.serviceAudits.map((row) => ({ id: `service-audit:${row.id}`, module: 'service' as const, action: row.action, entityId: row.serviceJobId!, title: `Service job ${row.serviceJob?.jobNumber ?? ''} updated`, occurredAt: row.changedAt.toISOString(), actor: row.changedByName, route: `/service/${row.serviceJobId}` })),
      ...records.products.map((row) => ({ id: `product:${row.id}`, module: 'products' as const, action: 'PRODUCT_ADDED', entityId: row.id, title: `Product ${row.name} added`, occurredAt: row.createdAt.toISOString(), actor: row.createdBy.fullName, route: `/products/${row.id}` })),
      ...records.presets.map((row) => ({ id: `pricing:${row.id}`, module: 'pricing' as const, action: 'PRICING_PRESET_UPDATED', entityId: row.id, title: `Pricing preset ${row.name} updated`, occurredAt: row.updatedAt.toISOString(), actor: row.updatedBy?.fullName ?? row.createdBy.fullName, route: `/pricing-presets/${row.id}` })),
    ];
    return { items: items.sort((a, b) => b.occurredAt.localeCompare(a.occurredAt) || a.id.localeCompare(b.id)).slice(0, limit) };
  }
}

function moduleForEntity(entityType: string): DashboardActivityItem['module'] {
  const value = entityType.toLowerCase();
  if (value.includes('supplier')) return 'suppliers';
  if (value.includes('service')) return 'service';
  if (value.includes('product')) return 'products';
  if (value.includes('pricing')) return 'pricing';
  if (value.includes('payment')) return 'payments';
  if (value.includes('debt') || value.includes('installment')) return 'debts';
  return 'customers';
}

function legacyTitle(action: string, entityType: string): string {
  return `${entityType.replaceAll('_', ' ')} ${action.replaceAll('_', ' ').toLowerCase()}`;
}

function routeFor(module: DashboardActivityItem['module'], id: string): string {
  if (module === 'service') return `/service/${id}`;
  if (module === 'products') return `/products/${id}`;
  if (module === 'suppliers') return `/suppliers/${id}`;
  return '/ledger';
}
