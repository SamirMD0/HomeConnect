import { Prisma } from '@prisma/client';
import { ValidationError } from '../../../lib/errors';
import { userTextSchema } from '../../../validators/user-text';
import { CreateSupplierAuditData, SupplierAuditRepository } from './supplier-audit.repository';

const reasonSchema = userTextSchema({ field: 'Reason', min: 5, max: 1000 });

export function writeSupplierAudit(input: CreateSupplierAuditData, tx: Prisma.TransactionClient) {
  return SupplierAuditRepository.create({
    ...input,
    reason: reasonSchema.parse(input.reason),
    beforeValues: jsonObject(input.beforeValues, 'beforeValues'),
    afterValues: jsonObject(input.afterValues, 'afterValues'),
  }, tx);
}

function jsonObject(value: Prisma.InputJsonValue, field: string): Prisma.InputJsonObject {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new ValidationError(`${field} must be a JSON object`);
  }
  return value as Prisma.InputJsonObject;
}
