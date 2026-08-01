import { Prisma, SupplierAuditAction, SupplierAuditRecordType } from '@prisma/client';
import { verifyAdminPassword } from '../../../lib/admin-verification';
import { AppError, NotFoundError, ValidationError } from '../../../lib/errors';
import { compareMoney, moneyToApiString, subtractMoney, sumMoney, ZERO_MONEY } from '../../financial/domain/money';
import { runFinancialTransaction } from '../../financial/infrastructure/transaction';
import { writeSupplierAudit } from '../audit/supplier-audit';
import { SupplierAuditRepository } from '../audit/supplier-audit.repository';
import { assertSupplierAdmin, containsSensitiveSupplierFields } from '../authorization/supplier-policy';
import { changedSnapshot, supplierSnapshot } from '../domain/supplier-domain';
import { SupplierMutationUser, SupplierRequestContext } from '../domain/supplier-types';
import {
  CreateSupplierInput, SupplierActionInput, SupplierAuditQueryInput,
  SupplierListQueryInput, UpdateSupplierInput,
} from './suppliers.validator';
import { SuppliersRepository } from './suppliers.repository';

export class SuppliersService {
  static async create(input: CreateSupplierInput, user: SupplierMutationUser, context: SupplierRequestContext) {
    assertSupplierAdmin(user);
    return runFinancialTransaction(async (tx) => {
      const supplier = await SuppliersRepository.create({
        name: input.name, phone: normalizePhone(input.phone), companyName: input.companyName ?? null,
        secondaryPhone: input.secondaryPhone ? normalizePhone(input.secondaryPhone) : null,
        email: input.email ?? null, notes: input.notes ?? null, createdById: user.userId,
      }, tx);
      const actor = await loadActor(user.userId, tx);
      await writeSupplierAudit(auditData(supplier.id, SupplierAuditAction.CREATE, user.userId, actor, 'Supplier created', {}, supplierSnapshot(supplier), context), tx);
      return serializeSupplier(supplier, '0.00');
    });
  }

  static async list(query: SupplierListQueryInput) {
    const result = query.sortBy === 'balance'
      ? { items: await SuppliersRepository.listAllForBalance(query), total: 0 }
      : await SuppliersRepository.list({ ...query, skip: (query.page - 1) * query.pageSize, take: query.pageSize });
    if (query.sortBy === 'balance') result.total = result.items.length;
    const balances = await SuppliersRepository.balances(result.items.map((item) => item.id));
    let items = result.items.map((item) => {
      const totals = balances.get(item.id) ?? { increase: '0.00', decrease: '0.00' };
      return serializeSupplier(item, moneyToApiString(subtractMoney(totals.increase, totals.decrease)));
    });
    if (query.sortBy === 'balance') {
      items = items
        .sort((a, b) => compareMoney(a.balance, b.balance) * (query.sortOrder === 'asc' ? 1 : -1))
        .slice((query.page - 1) * query.pageSize, query.page * query.pageSize);
    }
    return { items, total: result.total, page: query.page, pageSize: query.pageSize };
  }

  static async get(id: string) {
    const supplier = await SuppliersRepository.findById(id);
    if (!supplier) throw new NotFoundError('Supplier not found');
    const summary = await this.summary(id);
    return { ...serializeSupplier(supplier, summary.balance), summary };
  }

  static async summary(id: string) {
    if (!(await SuppliersRepository.findById(id))) throw new NotFoundError('Supplier not found');
    const rows = await SuppliersRepository.summaryRows(id);
    const increase = rows.filter((r) => r.direction === 'INCREASE_OWED').map((r) => r._sum.amount ?? ZERO_MONEY);
    const decrease = rows.filter((r) => r.direction === 'DECREASE_OWED').map((r) => r._sum.amount ?? ZERO_MONEY);
    const paid = rows.filter((r) => r.type === 'SUPPLIER_PAYMENT').map((r) => r._sum.amount ?? ZERO_MONEY);
    const credit = rows.filter((r) => r.type === 'SUPPLIER_CREDIT').map((r) => r._sum.amount ?? ZERO_MONEY);
    return {
      totalOwed: moneyToApiString(sumMoney(increase)), totalPaid: moneyToApiString(sumMoney(paid)),
      totalCredit: moneyToApiString(sumMoney(credit)),
      balance: moneyToApiString(subtractMoney(sumMoney(increase), sumMoney(decrease))),
      transactionCount: rows.reduce((total, row) => total + row._count._all, 0), basis: 'lifetime' as const,
    };
  }

  static async update(id: string, input: UpdateSupplierInput, user: SupplierMutationUser, context: SupplierRequestContext) {
    assertSupplierAdmin(user);
    const fields = Object.keys(input).filter((field) => !['reason', 'accountPassword'].includes(field) && input[field as keyof UpdateSupplierInput] !== undefined);
    if (!fields.length) throw new ValidationError('At least one supplier field is required');
    const sensitive = containsSensitiveSupplierFields(fields);
    if (sensitive && (!input.reason || !input.accountPassword)) throw new ValidationError('Reason and account password are required for name or phone changes');
    return runFinancialTransaction(async (tx) => {
      const existing = await requiredSupplier(id, tx);
      if (sensitive) await verify(user.userId, input.accountPassword!, 'UPDATE_SUPPLIER', id, context, tx);
      const data: Prisma.SupplierUncheckedUpdateInput = { updatedById: user.userId };
      if (input.name !== undefined) data.name = input.name;
      if (input.phone !== undefined) data.phone = normalizePhone(input.phone);
      if (input.companyName !== undefined) data.companyName = input.companyName;
      if (input.secondaryPhone !== undefined) data.secondaryPhone = input.secondaryPhone ? normalizePhone(input.secondaryPhone) : null;
      if (input.email !== undefined) data.email = input.email;
      if (input.notes !== undefined) data.notes = input.notes;
      const updated = await SuppliersRepository.update(id, data, tx);
      const actor = await loadActor(user.userId, tx);
      await writeSupplierAudit(auditData(id, SupplierAuditAction.UPDATE, user.userId, actor, input.reason ?? 'Supplier contact details updated', changedSnapshot(supplierSnapshot(existing), fields), changedSnapshot(supplierSnapshot(updated), fields), context), tx);
      const balance = await balanceInTx(id, tx);
      return serializeSupplier(updated, balance);
    });
  }

  static archive(id: string, input: SupplierActionInput, user: SupplierMutationUser, context: SupplierRequestContext) { return this.setActive(id, false, SupplierAuditAction.ARCHIVE, input, user, context); }
  static restore(id: string, input: SupplierActionInput, user: SupplierMutationUser, context: SupplierRequestContext) { return this.setActive(id, true, SupplierAuditAction.RESTORE, input, user, context); }

  static async delete(id: string, input: SupplierActionInput, user: SupplierMutationUser, context: SupplierRequestContext) {
    assertSupplierAdmin(user);
    return runFinancialTransaction(async (tx) => {
      const existing = await requiredSupplier(id, tx);
      await verify(user.userId, input.accountPassword, 'DELETE_SUPPLIER', id, context, tx);
      if ((await SuppliersRepository.transactionCount(id, tx)) > 0) throw new AppError('Supplier with transactions can only be archived', 409, 'SUPPLIER_HAS_TRANSACTIONS');
      const actor = await loadActor(user.userId, tx);
      await SuppliersRepository.deleteAudits(id, tx);
      await SuppliersRepository.delete(id, tx);
      await writeSupplierAudit(auditData(id, SupplierAuditAction.DELETE, user.userId, actor, input.reason, supplierSnapshot(existing), {}, context, null), tx);
      return { id, deleted: true };
    });
  }

  static async audit(id: string, query: SupplierAuditQueryInput) {
    await requiredSupplier(id);
    const result = await SupplierAuditRepository.list(id, (query.page - 1) * query.pageSize, query.pageSize);
    return { ...result, page: query.page, pageSize: query.pageSize };
  }

  private static async setActive(id: string, active: boolean, action: SupplierAuditAction, input: SupplierActionInput, user: SupplierMutationUser, context: SupplierRequestContext) {
    assertSupplierAdmin(user);
    return runFinancialTransaction(async (tx) => {
      const existing = await requiredSupplier(id, tx);
      if (existing.isActive === active) throw new AppError(`Supplier is already ${active ? 'active' : 'archived'}`, 409, 'SUPPLIER_STATE_CONFLICT');
      await verify(user.userId, input.accountPassword, active ? 'RESTORE_SUPPLIER' : 'ARCHIVE_SUPPLIER', id, context, tx);
      const updated = await SuppliersRepository.update(id, { isActive: active, archivedAt: active ? null : new Date(), archivedReason: active ? null : input.reason, updatedById: user.userId }, tx);
      const actor = await loadActor(user.userId, tx);
      await writeSupplierAudit(auditData(id, action, user.userId, actor, input.reason, { isActive: existing.isActive, archivedAt: existing.archivedAt?.toISOString() ?? null }, { isActive: updated.isActive, archivedAt: updated.archivedAt?.toISOString() ?? null }, context), tx);
      return serializeSupplier(updated, await balanceInTx(id, tx));
    });
  }
}

async function requiredSupplier(id: string, tx?: Prisma.TransactionClient) { const supplier = await SuppliersRepository.findById(id, tx); if (!supplier) throw new NotFoundError('Supplier not found'); return supplier; }
async function loadActor(id: string, tx: Prisma.TransactionClient) { const actor = await tx.user.findUnique({ where: { id }, select: { fullName: true, username: true } }); if (!actor) throw new NotFoundError('User not found'); return actor; }
async function balanceInTx(id: string, tx: Prisma.TransactionClient) { const map = await SuppliersRepository.balances([id], tx); const v = map.get(id) ?? { increase: '0.00', decrease: '0.00' }; return moneyToApiString(subtractMoney(v.increase, v.decrease)); }
function normalizePhone(value: string) { return value.trim().replace(/[\s\-()]/g, ''); }
function serializeSupplier(supplier: Awaited<ReturnType<typeof SuppliersRepository.findById>> extends infer T ? NonNullable<T> : never, balance: string) { return { ...supplier, balance }; }
function auditData(id: string, action: SupplierAuditAction, userId: string, actor: { fullName: string; username: string }, reason: string, beforeValues: Prisma.InputJsonObject, afterValues: Prisma.InputJsonObject, context: SupplierRequestContext, supplierId: string | null = id) { return { recordType: SupplierAuditRecordType.SUPPLIER, recordId: id, supplierId, action, changedById: userId, changedByName: actor.fullName, changedByUsername: actor.username, reason, beforeValues, afterValues, requestId: context.requestId, ipAddress: context.ipAddress }; }
function verify(userId: string, password: string, action: string, id: string, context: SupplierRequestContext, tx: Prisma.TransactionClient) { return verifyAdminPassword(userId, password, { action, recordType: 'SUPPLIER', recordId: id, ipAddress: context.ipAddress, domainLabel: 'supplier changes' }, tx); }
