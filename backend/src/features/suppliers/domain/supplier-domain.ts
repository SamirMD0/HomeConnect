import {
  Prisma,
  Supplier,
  SupplierTransaction,
  SupplierTransactionDirection,
  SupplierTransactionType,
} from '@prisma/client';
import { ValidationError } from '../../../lib/errors';
import { moneyToApiString } from '../../financial/domain/money';

export function resolveSupplierDirection(
  type: SupplierTransactionType,
  requested?: SupplierTransactionDirection
): SupplierTransactionDirection {
  if (type === SupplierTransactionType.SUPPLIER_ADJUSTMENT) {
    if (!requested) throw new ValidationError('Direction is required for an adjustment', { field: 'direction' });
    return requested;
  }
  const forced = type === SupplierTransactionType.SUPPLIER_DEBT
    ? SupplierTransactionDirection.INCREASE_OWED
    : SupplierTransactionDirection.DECREASE_OWED;
  if (requested && requested !== forced) {
    throw new ValidationError('Direction does not match transaction type', { field: 'direction' });
  }
  return forced;
}

export function supplierSnapshot(supplier: Supplier): Prisma.InputJsonObject {
  return {
    name: supplier.name, phone: supplier.phone, companyName: supplier.companyName,
    secondaryPhone: supplier.secondaryPhone, email: supplier.email, notes: supplier.notes,
    isActive: supplier.isActive, archivedAt: supplier.archivedAt?.toISOString() ?? null,
    archivedReason: supplier.archivedReason,
  };
}

export function supplierTransactionSnapshot(transaction: SupplierTransaction): Prisma.InputJsonObject {
  return {
    supplierId: transaction.supplierId, type: transaction.type, direction: transaction.direction,
    amount: moneyToApiString(transaction.amount),
    transactionDate: transaction.transactionDate.toISOString().slice(0, 10),
    description: transaction.description, reference: transaction.reference, notes: transaction.notes,
    status: transaction.status, removedAt: transaction.removedAt?.toISOString() ?? null,
    removedReason: transaction.removedReason,
  };
}

export function changedSnapshot(snapshot: Prisma.InputJsonObject, fields: string[]): Prisma.InputJsonObject {
  return Object.fromEntries(fields.map((field) => [field, snapshot[field] ?? null]));
}
