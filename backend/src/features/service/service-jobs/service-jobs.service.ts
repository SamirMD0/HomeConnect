import {
  Prisma,
  ServiceAuditAction,
  ServiceAuditRecordType,
  ServiceJobStatus,
  ServiceRequestType,
  ServiceRoutingDecision,
} from '@prisma/client';
import { verifyAdminPassword } from '../../../lib/admin-verification';
import { NotFoundError, ValidationError } from '../../../lib/errors';
import {
  businessDateToPrisma,
  prismaDateToBusinessDate,
  todayInBusinessTimezone,
} from '../../financial/domain/business-date';
import { moneyToApiString, parseMoney } from '../../financial/domain/money';
import { runFinancialTransaction } from '../../financial/infrastructure/transaction';
import { assertServiceAdmin, containsSensitiveServiceJobFields } from '../authorization/service-policy';
import { writeServiceAudit } from '../audit/service-audit';
import { ServiceAuditRepository } from '../audit/service-audit.repository';
import {
  assertServiceDateOrder,
  assertStatusTransitionAllowed,
  isRoutineForwardTransition,
  isTerminalServiceStatus,
  requiredDateForTransition,
} from '../domain/service-status';
import { RequestContext, ServiceMutationUser } from '../domain/service-types';
import { ServiceJobRecord, ServiceJobsRepository } from './service-jobs.repository';
import {
  CancelServiceJobInput,
  ChangeServiceStatusInput,
  CreateServiceJobInput,
  ReopenServiceJobInput,
  ServiceAuditQueryInput,
  ServiceJobListQueryInput,
  UpdateServiceJobInput,
} from './service-jobs.validator';

export class ServiceJobsService {
  static async create(input: CreateServiceJobInput, user: ServiceMutationUser, context: RequestContext) {
    validateInputDates(input);
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        return await runFinancialTransaction(async (tx) => {
          await assertReferences(input.customerId, input.productId, tx);
          const year = Number(input.serviceCreatedDate.slice(0, 4));
          const jobNumber = await ServiceJobsRepository.nextJobNumber(year, tx);
          const job = await ServiceJobsRepository.create(createData(input, user.userId, jobNumber), tx);
          await writeServiceAudit({
            recordType: ServiceAuditRecordType.SERVICE_JOB,
            recordId: job.id,
            serviceJobId: job.id,
            action: ServiceAuditAction.CREATE,
            changedById: user.userId,
            changedByName: job.createdBy.fullName,
            changedByUsername: job.createdBy.username,
            reason: 'Service job created',
            beforeValues: {},
            afterValues: serviceJobSnapshot(job),
            requestId: context.requestId,
            ipAddress: context.ipAddress,
          }, tx);
          return serializeServiceJob(job);
        });
      } catch (error) {
        if (isJobNumberCollision(error) && attempt < 2) continue;
        throw error;
      }
    }
    throw new ValidationError('Unable to allocate a service job number');
  }

  static async list(query: ServiceJobListQueryInput) {
    const result = await ServiceJobsRepository.list(query);
    return {
      items: result.items.map(serializeServiceJob),
      total: result.total,
      page: query.page,
      pageSize: query.pageSize,
    };
  }

  static async get(id: string) {
    const job = await ServiceJobsRepository.findById(id);
    if (!job) throw new NotFoundError('Service job not found');
    return serializeServiceJob(job);
  }

  static async update(
    id: string,
    input: UpdateServiceJobInput,
    user: ServiceMutationUser,
    context: RequestContext
  ) {
    const fields = Object.keys(input).filter((field) => !['reason', 'accountPassword'].includes(field));
    if (!fields.length) throw new ValidationError('At least one service job field is required');
    const sensitive = containsSensitiveServiceJobFields(fields);
    if (sensitive) requireSensitiveCredentials(input, user);

    return runFinancialTransaction(async (tx) => {
      const existing = await ServiceJobsRepository.findById(id, tx);
      if (!existing) throw new NotFoundError('Service job not found');
      if (sensitive) {
        await verifyAdminPassword(user.userId, input.accountPassword!, {
          action: 'UPDATE_SERVICE_JOB', recordType: 'SERVICE_JOB', recordId: id,
          ipAddress: context.ipAddress, domainLabel: 'service and product changes',
        }, tx);
      }
      const merged = mergedJobValues(existing, input);
      assertJobBusinessRules(merged);
      validateInputDates(merged);
      await assertReferences(merged.customerId, merged.productId, tx);
      const updated = await ServiceJobsRepository.update(id, updateData(input, user.userId), tx);
      if (sensitive) {
        const actor = await loadActor(user.userId, tx);
        await writeServiceAudit({
          recordType: ServiceAuditRecordType.SERVICE_JOB, recordId: id, serviceJobId: id,
          action: actionForFields(fields), changedById: user.userId,
          changedByName: actor.fullName, changedByUsername: actor.username,
          reason: input.reason!, beforeValues: changedSnapshot(existing, fields),
          afterValues: changedSnapshot(updated, fields), requestId: context.requestId,
          ipAddress: context.ipAddress,
        }, tx);
      }
      return serializeServiceJob(updated);
    });
  }

  static async changeStatus(
    id: string,
    input: ChangeServiceStatusInput,
    user: ServiceMutationUser,
    context: RequestContext
  ) {
    return runFinancialTransaction(async (tx) => {
      const existing = await ServiceJobsRepository.findById(id, tx);
      if (!existing) throw new NotFoundError('Service job not found');
      assertStatusTransitionAllowed(existing.status, input.status);
      const sensitive = !isRoutineForwardTransition(existing.status, input.status);
      if (sensitive) {
        requireSensitiveCredentials(input, user);
        await verifyAdminPassword(user.userId, input.accountPassword!, {
          action: 'CHANGE_SERVICE_STATUS', recordType: 'SERVICE_JOB', recordId: id,
          ipAddress: context.ipAddress, domainLabel: 'service and product changes',
        }, tx);
      }
      const dates = {
        serviceCreatedDate: prismaDateToBusinessDate(existing.serviceCreatedDate),
        sentToCompanyDate: input.sentToCompanyDate ?? dateOrNull(existing.sentToCompanyDate),
        receivedFromCompanyDate: input.receivedFromCompanyDate ?? dateOrNull(existing.receivedFromCompanyDate),
        returnedToCustomerDate: input.returnedToCustomerDate ?? dateOrNull(existing.returnedToCustomerDate),
      };
      const requiredDate = requiredDateForTransition(existing.status, input.status);
      if (requiredDate && !dates[requiredDate]) {
        throw new ValidationError(`${requiredDate} is required for this status change`, { field: requiredDate });
      }
      validateInputDates(dates);
      const data: Prisma.ServiceJobUncheckedUpdateInput = {
        status: input.status,
        updatedById: user.userId,
        ...(input.sentToCompanyDate !== undefined ? { sentToCompanyDate: dateOrDb(input.sentToCompanyDate) } : {}),
        ...(input.receivedFromCompanyDate !== undefined ? { receivedFromCompanyDate: dateOrDb(input.receivedFromCompanyDate) } : {}),
        ...(input.returnedToCustomerDate !== undefined ? { returnedToCustomerDate: dateOrDb(input.returnedToCustomerDate) } : {}),
        ...(input.status === ServiceJobStatus.DELIVERED_TO_CUSTOMER || input.status === ServiceJobStatus.NOT_REPAIRABLE
          ? { completedAt: new Date() } : {}),
      };
      const updated = await ServiceJobsRepository.update(id, data, tx);
      const actor = await loadActor(user.userId, tx);
      await writeServiceAudit({
        recordType: ServiceAuditRecordType.SERVICE_JOB, recordId: id, serviceJobId: id,
        action: ServiceAuditAction.CHANGE_STATUS, changedById: user.userId,
        changedByName: actor.fullName, changedByUsername: actor.username,
        reason: input.reason ?? `Status changed from ${existing.status} to ${input.status}`,
        beforeValues: { status: existing.status }, afterValues: { status: input.status },
        requestId: context.requestId, ipAddress: context.ipAddress,
      }, tx);
      return serializeServiceJob(updated);
    });
  }

  static async cancel(id: string, input: CancelServiceJobInput, user: ServiceMutationUser, context: RequestContext) {
    assertServiceAdmin(user);
    return runFinancialTransaction(async (tx) => {
      const existing = await ServiceJobsRepository.findById(id, tx);
      if (!existing) throw new NotFoundError('Service job not found');
      if (isTerminalServiceStatus(existing.status)) throw new ValidationError('Final service job cannot be cancelled');
      await verifyAdminPassword(user.userId, input.accountPassword, {
        action: 'CANCEL_SERVICE_JOB', recordType: 'SERVICE_JOB', recordId: id,
        ipAddress: context.ipAddress, domainLabel: 'service and product changes',
      }, tx);
      const updated = await ServiceJobsRepository.update(id, {
        status: ServiceJobStatus.CANCELLED, cancelledAt: new Date(), cancelledById: user.userId,
        cancelledReason: input.reason, updatedById: user.userId,
      }, tx);
      await auditTerminal(existing, updated, ServiceAuditAction.CANCEL, input.reason, user.userId, context, tx);
      return serializeServiceJob(updated);
    });
  }

  static async reopen(id: string, input: ReopenServiceJobInput, user: ServiceMutationUser, context: RequestContext) {
    assertServiceAdmin(user);
    return runFinancialTransaction(async (tx) => {
      const existing = await ServiceJobsRepository.findById(id, tx);
      if (!existing) throw new NotFoundError('Service job not found');
      if (!isTerminalServiceStatus(existing.status)) throw new ValidationError('Only final service jobs can be reopened');
      await verifyAdminPassword(user.userId, input.accountPassword, {
        action: 'REOPEN_SERVICE_JOB', recordType: 'SERVICE_JOB', recordId: id,
        ipAddress: context.ipAddress, domainLabel: 'service and product changes',
      }, tx);
      const updated = await ServiceJobsRepository.update(id, {
        status: input.status, completedAt: null, cancelledAt: null,
        cancelledById: null, cancelledReason: null, updatedById: user.userId,
      }, tx);
      await auditTerminal(existing, updated, ServiceAuditAction.REOPEN, input.reason, user.userId, context, tx);
      return serializeServiceJob(updated);
    });
  }

  static async audit(id: string, query: ServiceAuditQueryInput) {
    await this.get(id);
    return ServiceAuditRepository.list(ServiceAuditRecordType.SERVICE_JOB, id, (query.page - 1) * query.pageSize, query.pageSize);
  }

  static async summary() {
    const today = businessDateToPrisma(todayInBusinessTimezone());
    const overdueBefore = new Date(today); overdueBefore.setUTCDate(overdueBefore.getUTCDate() - 30);
    const monthStart = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1));
    const nextMonthStart = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() + 1, 1));
    const result = await ServiceJobsRepository.summary(overdueBefore, monthStart, nextMonthStart);
    const counts = Object.fromEntries(result.groups.map((group) => [group.status, group._count._all]));
    return {
      open: result.groups.reduce((sum, group) => sum + group._count._all, 0),
      atSupplier: counts.SENT_TO_COMPANY ?? 0,
      waitingForPart: counts.WAITING_FOR_PART ?? 0,
      awaitingCustomer: counts.WAITING_CUSTOMER_APPROVAL ?? 0,
      readyForPickup: counts.READY_FOR_PICKUP ?? 0,
      overdue: result.overdue,
      deliveredThisMonth: result.deliveredThisMonth,
    };
  }
}

function createData(input: CreateServiceJobInput, createdById: string, jobNumber: string): Prisma.ServiceJobUncheckedCreateInput {
  return {
    jobNumber, customerId: input.customerId, productId: input.productId ?? null,
    manualProductName: input.manualProductName ?? null, manualProductModel: input.manualProductModel ?? null,
    manualProductBrand: input.manualProductBrand ?? null, manualProductNotes: input.manualProductNotes ?? null,
    requestType: input.requestType, issueDescription: input.issueDescription,
    requestedPartName: input.requestedPartName ?? null, routingDecision: input.routingDecision ?? null,
    companyName: input.companyName ?? null, sentToCompanyDate: dateOrDb(input.sentToCompanyDate),
    receivedFromCompanyDate: dateOrDb(input.receivedFromCompanyDate), warrantyStatus: input.warrantyStatus,
    warrantyNotes: input.warrantyNotes ?? null, warrantyProvider: input.warrantyProvider ?? null,
    warrantyExpiresAt: dateOrDb(input.warrantyExpiresAt), estimatedPrice: moneyOrNull(input.estimatedPrice),
    finalPrice: moneyOrNull(input.finalPrice), priceNotes: input.priceNotes ?? null,
    serviceCreatedDate: businessDateToPrisma(input.serviceCreatedDate),
    homeVisitScheduledDate: dateOrDb(input.homeVisitScheduledDate),
    returnedToCustomerDate: dateOrDb(input.returnedToCustomerDate), status: input.status,
    notes: input.notes ?? null, createdById,
  };
}

function updateData(input: UpdateServiceJobInput, updatedById: string): Prisma.ServiceJobUncheckedUpdateInput {
  const data: Prisma.ServiceJobUncheckedUpdateInput = { updatedById };
  const plain = ['customerId','productId','manualProductName','manualProductModel','manualProductBrand','manualProductNotes','requestType','issueDescription','requestedPartName','routingDecision','companyName','warrantyStatus','warrantyNotes','warrantyProvider','priceNotes','notes'] as const;
  for (const field of plain) if (input[field] !== undefined) (data as Record<string, unknown>)[field] = input[field];
  const dates = ['sentToCompanyDate','receivedFromCompanyDate','warrantyExpiresAt','serviceCreatedDate','homeVisitScheduledDate','returnedToCustomerDate'] as const;
  for (const field of dates) if (input[field] !== undefined) (data as Record<string, unknown>)[field] = dateOrDb(input[field]);
  for (const field of ['estimatedPrice','finalPrice'] as const) if (input[field] !== undefined) (data as Record<string, unknown>)[field] = moneyOrNull(input[field]);
  return data;
}

function mergedJobValues(existing: ServiceJobRecord, input: UpdateServiceJobInput) {
  const value = <K extends keyof UpdateServiceJobInput>(key: K, fallback: unknown) => input[key] === undefined ? fallback : input[key];
  return {
    customerId: value('customerId', existing.customerId) as string,
    productId: value('productId', existing.productId) as string | null,
    manualProductName: value('manualProductName', existing.manualProductName) as string | null,
    manualProductModel: value('manualProductModel', existing.manualProductModel) as string | null,
    manualProductBrand: value('manualProductBrand', existing.manualProductBrand) as string | null,
    manualProductNotes: value('manualProductNotes', existing.manualProductNotes) as string | null,
    requestType: value('requestType', existing.requestType) as ServiceRequestType,
    requestedPartName: value('requestedPartName', existing.requestedPartName) as string | null,
    routingDecision: value('routingDecision', existing.routingDecision) as ServiceRoutingDecision | null,
    companyName: value('companyName', existing.companyName) as string | null,
    serviceCreatedDate: value('serviceCreatedDate', prismaDateToBusinessDate(existing.serviceCreatedDate)) as string,
    sentToCompanyDate: value('sentToCompanyDate', dateOrNull(existing.sentToCompanyDate)) as string | null,
    receivedFromCompanyDate: value('receivedFromCompanyDate', dateOrNull(existing.receivedFromCompanyDate)) as string | null,
    returnedToCustomerDate: value('returnedToCustomerDate', dateOrNull(existing.returnedToCustomerDate)) as string | null,
    homeVisitScheduledDate: value('homeVisitScheduledDate', dateOrNull(existing.homeVisitScheduledDate)) as string | null,
  };
}

function assertJobBusinessRules(values: ReturnType<typeof mergedJobValues>) {
  const hasProduct = Boolean(values.productId); const hasManual = Boolean(values.manualProductName);
  if (hasProduct === hasManual) throw new ValidationError('Choose one existing product or enter a manual product name');
  if (hasProduct && [values.manualProductModel, values.manualProductBrand, values.manualProductNotes].some(Boolean)) throw new ValidationError('Manual product fields cannot be used with an existing product');
  if (values.requestType === ServiceRequestType.PART_REPLACEMENT && !values.requestedPartName) throw new ValidationError('Requested part is required for part replacement');
  if (values.routingDecision === ServiceRoutingDecision.COMPANY && !values.companyName) throw new ValidationError('Company name is required when routing to a company');
}

function validateInputDates(input: { serviceCreatedDate: string; sentToCompanyDate?: string | null; receivedFromCompanyDate?: string | null; returnedToCustomerDate?: string | null; homeVisitScheduledDate?: string | null }) {
  assertServiceDateOrder(input);
  const today = todayInBusinessTimezone();
  for (const field of ['serviceCreatedDate','sentToCompanyDate','receivedFromCompanyDate','returnedToCustomerDate'] as const) {
    const value = input[field];
    if (value && value > today) throw new ValidationError(`${field} cannot be in the future`, { field });
  }
}

async function assertReferences(customerId: string, productId: string | null | undefined, tx: Prisma.TransactionClient) {
  const customer = await tx.customer.findFirst({ where: { id: customerId, deletedAt: null } });
  if (!customer) throw new NotFoundError('Customer not found');
  if (productId) {
    const product = await tx.product.findFirst({ where: { id: productId, isActive: true } });
    if (!product) throw new NotFoundError('Active product not found');
  }
}

function requireSensitiveCredentials(input: { reason?: string; accountPassword?: string }, user: ServiceMutationUser) {
  assertServiceAdmin(user);
  if (!input.reason) throw new ValidationError('Reason is required for sensitive service changes');
  if (!input.accountPassword) throw new ValidationError('Account password is required');
}

function actionForFields(fields: string[]): ServiceAuditAction {
  if (fields.some((field) => ['estimatedPrice','finalPrice','priceNotes'].includes(field))) return ServiceAuditAction.CHANGE_PRICE;
  if (fields.some((field) => field.startsWith('warranty'))) return ServiceAuditAction.CHANGE_WARRANTY;
  if (fields.some((field) => ['routingDecision','companyName'].includes(field))) return ServiceAuditAction.CHANGE_ROUTING;
  if (fields.some((field) => field.endsWith('Date'))) return ServiceAuditAction.CHANGE_DATES;
  return ServiceAuditAction.UPDATE_DETAILS;
}

async function auditTerminal(existing: ServiceJobRecord, updated: ServiceJobRecord, action: ServiceAuditAction, reason: string, userId: string, context: RequestContext, tx: Prisma.TransactionClient) {
  const actor = await loadActor(userId, tx);
  await writeServiceAudit({
    recordType: ServiceAuditRecordType.SERVICE_JOB, recordId: existing.id, serviceJobId: existing.id,
    action, changedById: userId, changedByName: actor.fullName, changedByUsername: actor.username,
    reason, beforeValues: { status: existing.status }, afterValues: { status: updated.status },
    requestId: context.requestId, ipAddress: context.ipAddress,
  }, tx);
}

export function serializeServiceJob(job: ServiceJobRecord) {
  return {
    ...job,
    serviceCreatedDate: prismaDateToBusinessDate(job.serviceCreatedDate),
    sentToCompanyDate: dateOrNull(job.sentToCompanyDate),
    receivedFromCompanyDate: dateOrNull(job.receivedFromCompanyDate),
    warrantyExpiresAt: dateOrNull(job.warrantyExpiresAt),
    homeVisitScheduledDate: dateOrNull(job.homeVisitScheduledDate),
    returnedToCustomerDate: dateOrNull(job.returnedToCustomerDate),
    estimatedPrice: job.estimatedPrice ? moneyToApiString(job.estimatedPrice) : null,
    finalPrice: job.finalPrice ? moneyToApiString(job.finalPrice) : null,
  };
}

function serviceJobSnapshot(job: ServiceJobRecord): Prisma.InputJsonObject {
  const serialized = serializeServiceJob(job);
  const keys = ['jobNumber','customerId','productId','manualProductName','manualProductModel','manualProductBrand','requestType','issueDescription','requestedPartName','routingDecision','companyName','warrantyStatus','estimatedPrice','finalPrice','serviceCreatedDate','status','notes'];
  return Object.fromEntries(keys.map((key) => [key, (serialized as Record<string, unknown>)[key] ?? null])) as Prisma.InputJsonObject;
}

function changedSnapshot(job: ServiceJobRecord, fields: string[]): Prisma.InputJsonObject {
  const serialized = serializeServiceJob(job) as Record<string, unknown>;
  return Object.fromEntries(fields.map((field) => [field, serialized[field] ?? null])) as Prisma.InputJsonObject;
}

async function loadActor(userId: string, tx: Prisma.TransactionClient) {
  const actor = await tx.user.findUnique({ where: { id: userId }, select: { fullName: true, username: true } });
  if (!actor) throw new NotFoundError('User not found'); return actor;
}

function dateOrDb(value?: string | null) { return value == null ? null : businessDateToPrisma(value); }
function dateOrNull(value?: Date | null) { return value ? prismaDateToBusinessDate(value) : null; }
function moneyOrNull(value?: string | null) { return value == null ? null : parseMoney(value); }
function isJobNumberCollision(error: unknown) { return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002' && String(error.meta?.target).includes('jobNumber'); }
