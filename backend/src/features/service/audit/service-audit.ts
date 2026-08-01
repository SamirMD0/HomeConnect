import { Prisma } from '@prisma/client';
import { ValidationError } from '../../../lib/errors';
import { userTextSchema } from '../../../validators/user-text';
import { CreateServiceAuditData, ServiceAuditRepository } from './service-audit.repository';

const reasonSchema = userTextSchema({ field: 'Reason', min: 5, max: 1000 });

export async function writeServiceAudit(
  input: CreateServiceAuditData,
  tx?: Prisma.TransactionClient
) {
  return ServiceAuditRepository.create(
    {
      ...input,
      reason: reasonSchema.parse(input.reason),
      beforeValues: assertJsonObject(input.beforeValues, 'beforeValues'),
      afterValues: assertJsonObject(input.afterValues, 'afterValues'),
    },
    tx
  );
}

function assertJsonObject(value: Prisma.InputJsonValue, field: string): Prisma.InputJsonObject {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new ValidationError(`${field} must be a JSON object`);
  }
  return value as Prisma.InputJsonObject;
}
