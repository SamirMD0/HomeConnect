import { Role, ServiceJobStatus } from '@prisma/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { repository, writeAudit, verify, tx } = vi.hoisted(() => {
  const transaction = {
    user: { findUnique: vi.fn() },
    customer: { findFirst: vi.fn() },
    product: { findFirst: vi.fn() },
  };
  return { repository: { findById: vi.fn(), update: vi.fn() }, writeAudit: vi.fn(), verify: vi.fn(), tx: transaction };
});

vi.mock('./service-jobs.repository', () => ({ ServiceJobsRepository: repository }));
vi.mock('../audit/service-audit', () => ({ writeServiceAudit: writeAudit }));
vi.mock('../audit/service-audit.repository', () => ({ ServiceAuditRepository: { list: vi.fn() } }));
vi.mock('../../../lib/admin-verification', () => ({ verifyAdminPassword: verify }));
vi.mock('../../financial/infrastructure/transaction', () => ({ runFinancialTransaction: (operation: (client: unknown) => unknown) => operation(tx) }));
vi.mock('../../../lib/prisma', () => ({ prisma: {}, transactionModel: {}, activityLogModel: {} }));

import { ServiceJobsService } from './service-jobs.service';

const admin = { userId: '11111111-1111-4111-8111-111111111111', role: Role.ADMIN, username: 'admin' };
const employee = { ...admin, userId: '22222222-2222-4222-8222-222222222222', role: Role.EMPLOYEE };
const context = { requestId: 'request-1', ipAddress: '127.0.0.1' };
const jobId = '33333333-3333-4333-8333-333333333333';

const jobOf = (overrides: Record<string, unknown> = {}) => ({
  id: jobId, jobNumber: 'SV-2026-0001',
  customerId: '44444444-4444-4444-8444-444444444444', productId: null,
  manualProductName: 'مروحة', manualProductModel: null, manualProductBrand: null, manualProductNotes: null,
  requestType: 'WORKSHOP_DROP_OFF', issueDescription: 'Does not start', requestedPartName: null,
  routingDecision: null, companyName: null, sentToCompanyDate: null, receivedFromCompanyDate: null,
  warrantyStatus: 'NOT_APPLICABLE', warrantyNotes: null, warrantyProvider: null, warrantyExpiresAt: null,
  estimatedPrice: null, finalPrice: null, priceNotes: null,
  serviceCreatedDate: new Date('2026-08-01T00:00:00Z'), homeVisitScheduledDate: null, returnedToCustomerDate: null,
  status: ServiceJobStatus.RECEIVED, notes: null, completedAt: null,
  cancelledAt: null, cancelledById: null, cancelledReason: null,
  createdById: admin.userId, updatedById: null,
  createdAt: new Date('2026-08-01T00:00:00Z'), updatedAt: new Date('2026-08-01T00:00:00Z'),
  customer: null, product: null, createdBy: { fullName: 'Admin User', username: 'admin' }, updatedBy: null,
  ...overrides,
});

const lastAudit = () => writeAudit.mock.calls.at(-1)?.[0];

describe('service job security and audit policy', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    tx.user.findUnique.mockResolvedValue({ fullName: 'Admin User', username: 'admin' });
    tx.customer.findFirst.mockResolvedValue({ id: '44444444-4444-4444-8444-444444444444' });
    tx.product.findFirst.mockResolvedValue(null);
    const existing = jobOf();
    repository.findById.mockResolvedValue(existing);
    repository.update.mockImplementation((_id: string, data: Record<string, unknown>) => Promise.resolve({ ...existing, ...data }));
  });

  // The regression this whole checkpoint hinges on: before v1.8.1 a non-sensitive
  // update wrote NO audit row at all, so relaxing the branch naively would have
  // removed audit coverage instead of only removing friction.
  it('writes an audit row for a NON-sensitive update', async () => {
    await ServiceJobsService.update(jobId, { notes: 'Left at the counter' }, employee, context);
    expect(writeAudit).toHaveBeenCalledTimes(1);
    expect(lastAudit()).toMatchObject({
      recordType: 'SERVICE_JOB', recordId: jobId, serviceJobId: jobId, action: 'UPDATE_DETAILS',
      changedById: employee.userId, changedByName: 'Admin User', changedByUsername: 'admin',
      reason: 'Service job updated / تم تحديث طلب الصيانة',
      beforeValues: { notes: null }, afterValues: { notes: 'Left at the counter' },
    });
  });

  it('writes an audit row for a sensitive admin update, with no password', async () => {
    await ServiceJobsService.update(jobId, { finalPrice: '75.00' }, admin, context);
    expect(writeAudit).toHaveBeenCalledTimes(1);
    expect(lastAudit()).toMatchObject({ action: 'CHANGE_PRICE', reason: 'Service job pricing updated / تم تحديث تسعير طلب الصيانة' });
    expect(verify).not.toHaveBeenCalled();
  });

  it('derives the reason from the audit action', async () => {
    await ServiceJobsService.update(jobId, { warrantyStatus: 'UNDER_WARRANTY' }, admin, context);
    expect(lastAudit()).toMatchObject({ action: 'CHANGE_WARRANTY', reason: 'Service job warranty updated / تم تحديث ضمان طلب الصيانة' });

    await ServiceJobsService.update(jobId, { routingDecision: 'WORKSHOP' }, admin, context);
    expect(lastAudit()).toMatchObject({ action: 'CHANGE_ROUTING', reason: 'Service job routing updated / تم تحديث توجيه طلب الصيانة' });
  });

  it('keeps sensitive fields admin-only', async () => {
    await expect(ServiceJobsService.update(jobId, { finalPrice: '75.00' }, employee, context)).rejects.toThrow();
    expect(repository.update).not.toHaveBeenCalled();
    expect(writeAudit).not.toHaveBeenCalled();
  });

  it('still lets an employee edit the non-sensitive fields they could edit before', async () => {
    await ServiceJobsService.update(jobId, { notes: 'Left at the counter' }, employee, context);
    await ServiceJobsService.update(jobId, { requestedPartName: 'Motor' }, employee, context);
    expect(repository.update).toHaveBeenCalledTimes(2);
    expect(writeAudit).toHaveBeenCalledTimes(2);
  });

  it('audits a routine forward status change made by an employee, with no password', async () => {
    await ServiceJobsService.changeStatus(jobId, { status: ServiceJobStatus.INSPECTION_PENDING }, employee, context);
    expect(lastAudit()).toMatchObject({
      action: 'CHANGE_STATUS',
      reason: 'Status changed from RECEIVED to INSPECTION_PENDING / تم تغيير الحالة من RECEIVED إلى INSPECTION_PENDING',
      beforeValues: { status: 'RECEIVED' }, afterValues: { status: 'INSPECTION_PENDING' },
    });
    expect(verify).not.toHaveBeenCalled();
  });

  it('keeps non-routine status changes admin-only but password-free', async () => {
    repository.findById.mockResolvedValue(jobOf({ status: ServiceJobStatus.READY_FOR_PICKUP }));
    const backwards = { status: ServiceJobStatus.INSPECTION_PENDING };
    await expect(ServiceJobsService.changeStatus(jobId, backwards, employee, context)).rejects.toThrow();

    await ServiceJobsService.changeStatus(jobId, backwards, admin, context);
    expect(lastAudit()).toMatchObject({ action: 'CHANGE_STATUS' });
    expect(verify).not.toHaveBeenCalled();
  });

  it('keeps the admin password and typed reason on cancel and reopen', async () => {
    await ServiceJobsService.cancel(jobId, { reason: 'Customer cancelled job', accountPassword: 'secret' }, admin, context);
    expect(verify).toHaveBeenCalledTimes(1);
    expect(lastAudit()).toMatchObject({ action: 'CANCEL', reason: 'Customer cancelled job' });

    repository.findById.mockResolvedValue(jobOf({ status: ServiceJobStatus.CANCELLED }));
    await ServiceJobsService.reopen(jobId, { status: ServiceJobStatus.RECEIVED, reason: 'Reopened by request', accountPassword: 'secret' }, admin, context);
    expect(verify).toHaveBeenCalledTimes(2);
    expect(lastAudit()).toMatchObject({ action: 'REOPEN', reason: 'Reopened by request' });
  });
});
