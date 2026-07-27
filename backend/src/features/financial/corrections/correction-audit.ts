import { Prisma } from '@prisma/client';
import { ValidationError } from '../../../lib/errors';
import { FinancialTransactionClient } from '../infrastructure/transaction';
import { correctionReasonSchema } from './corrections.validator';
import {
  CorrectionAuditRepository,
  CreateCorrectionAuditData,
} from './correction-audit.repository';

export type FinancialCorrectionAuditInput = CreateCorrectionAuditData;

export async function writeFinancialCorrectionAudit(input: FinancialCorrectionAuditInput, tx?: FinancialTransactionClient) {
  const reason = correctionReasonSchema.parse(input.reason);
  const beforeValues = assertJsonObject(input.beforeValues, 'beforeValues');
  const afterValues = assertJsonObject(input.afterValues, 'afterValues');

  return CorrectionAuditRepository.createCorrectionAudit({
    ...input,
    reason,
    beforeValues,
    afterValues,
  }, tx);
}

function assertJsonObject(value: Prisma.InputJsonValue, field: string): Prisma.InputJsonObject {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new ValidationError(`${field} must be a JSON object`);
  }
  return value as Prisma.InputJsonObject;
}
