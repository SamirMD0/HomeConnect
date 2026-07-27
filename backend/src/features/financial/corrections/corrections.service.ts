import { businessDateToPrisma, parseBusinessDate } from '../index';
import { CorrectionAuditRepository } from './correction-audit.repository';
import { CorrectionsQueryInput } from './corrections.validator';

export class CorrectionsService {
  static async listCorrections(query: CorrectionsQueryInput) {
    const corrections = await CorrectionAuditRepository.listCorrectionAudits({
      recordType: query.recordType,
      recordId: query.recordId,
      customerId: query.customerId,
      from: query.from ? businessDateToPrisma(parseBusinessDate(query.from)) : undefined,
      to: query.to ? businessDateToPrisma(parseBusinessDate(query.to)) : undefined,
    });

    return corrections.map((correction) => ({
      id: correction.id,
      recordType: correction.recordType,
      recordId: correction.recordId,
      customerId: correction.customerId,
      action: correction.action,
      correctedBy: {
        id: correction.correctedById,
        name: correction.correctedByName,
        username: correction.correctedByUsername,
      },
      correctedAt: correction.correctedAt.toISOString(),
      reason: correction.reason,
      beforeValues: correction.beforeValues,
      afterValues: correction.afterValues,
      affectedTotals: correction.affectedTotals,
      sourceScreen: correction.sourceScreen,
      requestId: correction.requestId,
      ipAddress: correction.ipAddress,
    }));
  }
}
