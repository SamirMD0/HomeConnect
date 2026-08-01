import { Prisma, SupplierAuditAction, SupplierAuditRecordType, SupplierTransactionStatus } from '@prisma/client';
import { verifyAdminPassword } from '../../../lib/admin-verification';
import { AppError, NotFoundError, ValidationError } from '../../../lib/errors';
import { assertPositiveMoney, moneyToApiString, subtractMoney, sumMoney, ZERO_MONEY } from '../../financial/domain/money';
import { businessDateToPrisma, prismaDateToBusinessDate } from '../../financial/domain/business-date';
import { runFinancialTransaction } from '../../financial/infrastructure/transaction';
import { writeSupplierAudit } from '../audit/supplier-audit';
import { assertSupplierAdmin } from '../authorization/supplier-policy';
import { resolveSupplierDirection, supplierTransactionSnapshot, changedSnapshot } from '../domain/supplier-domain';
import { SupplierMutationUser, SupplierRequestContext } from '../domain/supplier-types';
import { SuppliersRepository } from '../suppliers/suppliers.repository';
import { SupplierTransactionsRepository, supplierTransactionWhere } from './supplier-transactions.repository';
import { CreateSupplierTransactionInput, SupplierLedgerQueryInput, SupplierTransactionActionInput, SupplierTransactionListQueryInput, UpdateSupplierTransactionInput } from './supplier-transactions.validator';

export class SupplierTransactionsService {
  static async create(supplierId: string, input: CreateSupplierTransactionInput, user: SupplierMutationUser, context: SupplierRequestContext) {
    assertSupplierAdmin(user);
    const amount = assertPositiveMoney(input.amount);
    const direction = resolveSupplierDirection(input.type, input.direction);
    return runFinancialTransaction(async (tx) => {
      const supplier = await SuppliersRepository.findById(supplierId, tx);
      if (!supplier) throw new NotFoundError('Supplier not found');
      if (!supplier.isActive) throw new AppError('Archived suppliers cannot receive new transactions', 409, 'SUPPLIER_ARCHIVED');
      const transaction = await SupplierTransactionsRepository.create({ supplierId, type: input.type, direction, amount, transactionDate: businessDateToPrisma(input.transactionDate), description: input.description, reference: input.reference ?? null, notes: input.notes ?? null, createdById: user.userId }, tx);
      const actor = await loadActor(user.userId, tx);
      await writeSupplierAudit({ recordType: SupplierAuditRecordType.SUPPLIER_TRANSACTION, recordId: transaction.id, supplierId, supplierTransactionId: transaction.id, action: SupplierAuditAction.CREATE, changedById: user.userId, changedByName: actor.fullName, changedByUsername: actor.username, reason: 'Supplier transaction created', beforeValues: {}, afterValues: supplierTransactionSnapshot(transaction), requestId: context.requestId, ipAddress: context.ipAddress }, tx);
      return serializeTransaction(transaction);
    });
  }

  static async get(id: string) { const transaction = await SupplierTransactionsRepository.findById(id); if (!transaction) throw new NotFoundError('Supplier transaction not found'); return serializeTransaction(transaction); }

  static async list(query: SupplierLedgerQueryInput) {
    const result = await SupplierTransactionsRepository.list(query);
    return { items: result.items.map(serializeTransaction), total: result.total, page: query.page, pageSize: query.pageSize };
  }

  static async listForSupplier(supplierId: string, query: SupplierTransactionListQueryInput) {
    if (!(await SuppliersRepository.findById(supplierId))) throw new NotFoundError('Supplier not found');
    const ledgerQuery: SupplierLedgerQueryInput = { ...query, supplierId, type: undefined, direction: undefined, dateFrom: undefined, dateTo: undefined, search: undefined, sortBy: 'transactionDate', sortOrder: 'desc' };
    const result = await SupplierTransactionsRepository.list(ledgerQuery, supplierId);
    return { items: result.items.map(serializeTransaction), total: result.total, page: query.page, pageSize: query.pageSize };
  }

  static async ledger(query: SupplierLedgerQueryInput) {
    const result = await SupplierTransactionsRepository.list(query);
    const [summary, supplierCount] = await Promise.all([summaryForWhere(result.where), SupplierTransactionsRepository.supplierCount(result.where)]);
    return { summary: { ...summary, supplierCount, basis: 'filtered' as const }, items: result.items.map(serializeTransaction), pagination: { page: query.page, pageSize: query.pageSize, total: result.total, totalPages: Math.ceil(result.total / query.pageSize) } };
  }

  static async update(id: string, input: UpdateSupplierTransactionInput, user: SupplierMutationUser, context: SupplierRequestContext) {
    assertSupplierAdmin(user);
    const fields = Object.keys(input).filter((f) => !['reason','accountPassword'].includes(f) && input[f as keyof UpdateSupplierTransactionInput] !== undefined);
    if (!fields.length) throw new ValidationError('At least one transaction field is required');
    return runFinancialTransaction(async (tx) => {
      const existing = await requiredTransaction(id, tx);
      if (existing.status === SupplierTransactionStatus.REMOVED) throw new AppError('Restore the transaction before editing it', 409, 'SUPPLIER_TRANSACTION_REMOVED');
      await verify(user.userId, input.accountPassword, 'UPDATE_SUPPLIER_TRANSACTION', id, context, tx);
      const type = input.type ?? existing.type;
      const requestedDirection = input.direction ?? (type === 'SUPPLIER_ADJUSTMENT' ? existing.direction : undefined);
      const data: Prisma.SupplierTransactionUncheckedUpdateInput = { updatedById: user.userId, type, direction: resolveSupplierDirection(type, requestedDirection) };
      if (input.amount !== undefined) data.amount = assertPositiveMoney(input.amount);
      if (input.transactionDate !== undefined) data.transactionDate = businessDateToPrisma(input.transactionDate);
      if (input.description !== undefined) data.description = input.description;
      if (input.reference !== undefined) data.reference = input.reference;
      if (input.notes !== undefined) data.notes = input.notes;
      const beforeBalance = await supplierBalance(existing.supplierId, tx);
      const updated = await SupplierTransactionsRepository.update(id, data, tx);
      const afterBalance = await supplierBalance(existing.supplierId, tx);
      await auditChange(existing, updated, fields, SupplierAuditAction.UPDATE, input.reason, user.userId, context, tx, beforeBalance, afterBalance);
      return serializeTransaction(updated);
    });
  }

  static remove(id: string, input: SupplierTransactionActionInput, user: SupplierMutationUser, context: SupplierRequestContext) { return this.setStatus(id, SupplierTransactionStatus.REMOVED, SupplierAuditAction.REMOVE, input, user, context); }
  static restore(id: string, input: SupplierTransactionActionInput, user: SupplierMutationUser, context: SupplierRequestContext) { return this.setStatus(id, SupplierTransactionStatus.ACTIVE, SupplierAuditAction.RESTORE_TRANSACTION, input, user, context); }

  private static async setStatus(id: string, status: SupplierTransactionStatus, action: SupplierAuditAction, input: SupplierTransactionActionInput, user: SupplierMutationUser, context: SupplierRequestContext) {
    assertSupplierAdmin(user);
    return runFinancialTransaction(async (tx) => {
      const existing = await requiredTransaction(id, tx);
      if (existing.status === status) throw new AppError(`Transaction is already ${status.toLowerCase()}`, 409, 'SUPPLIER_TRANSACTION_STATE_CONFLICT');
      await verify(user.userId, input.accountPassword, action === SupplierAuditAction.REMOVE ? 'REMOVE_SUPPLIER_TRANSACTION' : 'RESTORE_SUPPLIER_TRANSACTION', id, context, tx);
      const beforeBalance = await supplierBalance(existing.supplierId, tx);
      const updated = await SupplierTransactionsRepository.update(id, status === SupplierTransactionStatus.REMOVED ? { status, removedAt: new Date(), removedById: user.userId, removedReason: input.reason, updatedById: user.userId } : { status, removedAt: null, removedById: null, removedReason: null, updatedById: user.userId }, tx);
      const afterBalance = await supplierBalance(existing.supplierId, tx);
      await auditChange(existing, updated, ['status','removedAt','removedReason'], action, input.reason, user.userId, context, tx, beforeBalance, afterBalance);
      return serializeTransaction(updated);
    });
  }
}

export async function summaryForWhere(where: Prisma.SupplierTransactionWhereInput, tx?: Prisma.TransactionClient) {
  const rows = await SupplierTransactionsRepository.summaryRows(where, tx);
  const increases = rows.filter((r) => r.direction === 'INCREASE_OWED').map((r) => r._sum.amount ?? ZERO_MONEY);
  const decreases = rows.filter((r) => r.direction === 'DECREASE_OWED').map((r) => r._sum.amount ?? ZERO_MONEY);
  const paid = rows.filter((r) => r.type === 'SUPPLIER_PAYMENT').map((r) => r._sum.amount ?? ZERO_MONEY);
  const credit = rows.filter((r) => r.type === 'SUPPLIER_CREDIT').map((r) => r._sum.amount ?? ZERO_MONEY);
  return { totalOwed: moneyToApiString(sumMoney(increases)), totalPaid: moneyToApiString(sumMoney(paid)), totalCredit: moneyToApiString(sumMoney(credit)), balance: moneyToApiString(subtractMoney(sumMoney(increases), sumMoney(decreases))), transactionCount: rows.reduce((n, r) => n + r._count._all, 0) };
}

async function supplierBalance(supplierId: string, tx: Prisma.TransactionClient) { return (await summaryForWhere(supplierTransactionWhere({ supplierId, includeRemoved: false }), tx)).balance; }
async function requiredTransaction(id: string, tx: Prisma.TransactionClient) { const t = await SupplierTransactionsRepository.findById(id, tx); if (!t) throw new NotFoundError('Supplier transaction not found'); return t; }
async function loadActor(id: string, tx: Prisma.TransactionClient) { const actor = await tx.user.findUnique({ where: { id }, select: { fullName: true, username: true } }); if (!actor) throw new NotFoundError('User not found'); return actor; }
async function auditChange(before: NonNullable<Awaited<ReturnType<typeof SupplierTransactionsRepository.findById>>>, after: NonNullable<Awaited<ReturnType<typeof SupplierTransactionsRepository.findById>>>, fields: string[], action: SupplierAuditAction, reason: string, userId: string, context: SupplierRequestContext, tx: Prisma.TransactionClient, balanceBefore: string, balanceAfter: string) { const actor = await loadActor(userId, tx); await writeSupplierAudit({ recordType: SupplierAuditRecordType.SUPPLIER_TRANSACTION, recordId: before.id, supplierId: before.supplierId, supplierTransactionId: before.id, action, changedById: userId, changedByName: actor.fullName, changedByUsername: actor.username, reason, beforeValues: changedSnapshot(supplierTransactionSnapshot(before), fields), afterValues: changedSnapshot(supplierTransactionSnapshot(after), fields), affectedTotals: { balanceBefore, balanceAfter }, requestId: context.requestId, ipAddress: context.ipAddress }, tx); }
function verify(userId: string, password: string, action: string, id: string, context: SupplierRequestContext, tx: Prisma.TransactionClient) { return verifyAdminPassword(userId, password, { action, recordType: 'SUPPLIER_TRANSACTION', recordId: id, ipAddress: context.ipAddress, domainLabel: 'supplier changes' }, tx); }
function serializeTransaction(t: NonNullable<Awaited<ReturnType<typeof SupplierTransactionsRepository.findById>>>) { return { ...t, amount: moneyToApiString(t.amount), transactionDate: prismaDateToBusinessDate(t.transactionDate) }; }
