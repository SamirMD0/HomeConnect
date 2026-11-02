import { Currency, SupplierTransactionDirection, SupplierTransactionStatus, SupplierTransactionType } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
import { NotFoundError } from '../../../lib/errors';
import { prisma } from '../../../lib/prisma';
import type { BranchScope } from '../../branches/branch-scope';
import { moneyToApiString, sumMoney, ZERO_MONEY } from '../../financial/domain/money';
import { prismaDateToBusinessDate, todayInBusinessTimezone } from '../../financial/domain/business-date';
import { supplierTransactionWhere } from '../transactions/supplier-transactions.repository';

export interface SupplierStatementQuery {
  from: string;
  to: string;
}

export interface SupplierStatementRecord {
  id: string;
  type: SupplierTransactionType;
  direction: SupplierTransactionDirection;
  status: SupplierTransactionStatus;
  amount: Decimal;
  currency: Currency;
  exchangeRate: Decimal;
  baseAmount: Decimal;
  transactionDate: Date;
  dueDate: Date | null;
  description: string;
  reference: string | null;
  receiptNumber?: string | null;
  removedReason: string | null;
  createdAt: Date;
}

export interface SupplierStatementParty {
  id: string;
  name: string;
  phone: string;
  companyName: string | null;
}

export class SupplierStatementService {
  static async get(supplierId: string, query: SupplierStatementQuery, scope: BranchScope) {
    const supplier = await prisma.supplier.findUnique({
      where: { id: supplierId },
      select: { id: true, name: true, phone: true, companyName: true },
    });
    if (!supplier) throw new NotFoundError('Supplier not found');
    const records = await prisma.supplierTransaction.findMany({
      where: supplierTransactionWhere({ supplierId, includeRemoved: true }, scope),
      select: {
        id: true, type: true, direction: true, status: true, amount: true, currency: true, exchangeRate: true,
        baseAmount: true, transactionDate: true, dueDate: true, description: true, reference: true, receiptNumber: true,
        removedReason: true, createdAt: true,
      },
    });
    return buildSupplierStatement(supplier, records, query);
  }
}

/**
 * Positive balance is what the business owes the supplier, the same figure as
 * the supplier's summary. A removed transaction stays visible but moves nothing.
 */
export function buildSupplierStatement(
  supplier: SupplierStatementParty,
  records: SupplierStatementRecord[],
  query: SupplierStatementQuery
) {
  const dated = records
    .map((record) => ({ record, date: prismaDateToBusinessDate(record.transactionDate), effect: effectOf(record) }))
    .sort((left, right) =>
      left.date.localeCompare(right.date)
      || left.record.createdAt.getTime() - right.record.createdAt.getTime()
      || left.record.id.localeCompare(right.record.id));

  const opening = sumMoney(dated.filter((item) => item.date < query.from).map((item) => item.effect));
  let running = opening;
  const entries = dated
    .filter((item) => item.date >= query.from && item.date <= query.to)
    .map(({ record, date, effect }) => {
      running = sumMoney([running, effect]);
      return {
        id: record.id,
        type: record.type,
        date,
        description: record.description,
        reference: record.reference ?? record.receiptNumber ?? null,
        originalAmount: moneyToApiString(record.amount, record.currency),
        currency: record.currency,
        exchangeRate: record.exchangeRate.toString(),
        baseAmount: moneyToApiString(record.baseAmount),
        balanceEffect: moneyToApiString(effect),
        runningBalance: moneyToApiString(running),
        status: record.status === SupplierTransactionStatus.REMOVED ? 'REMOVED' as const : 'POSTED' as const,
        dueDate: record.dueDate ? prismaDateToBusinessDate(record.dueDate) : null,
        reason: record.removedReason,
      };
    });

  return {
    businessDate: todayInBusinessTimezone(),
    currency: Currency.USD,
    supplier,
    range: { from: query.from, to: query.to },
    openingBalance: moneyToApiString(opening),
    entries,
    closingBalance: moneyToApiString(running),
  };
}

function effectOf(record: SupplierStatementRecord): Decimal {
  if (record.status === SupplierTransactionStatus.REMOVED) return ZERO_MONEY;
  return record.direction === SupplierTransactionDirection.INCREASE_OWED
    ? record.baseAmount
    : record.baseAmount.negated();
}
