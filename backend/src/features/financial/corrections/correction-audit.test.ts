import {
  FinancialCorrectionAction,
  FinancialCorrectionRecordType,
  FinancialCorrectionSourceScreen,
} from '@prisma/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ValidationError } from '../../../lib/errors';
import { writeFinancialCorrectionAudit } from './correction-audit';

const { repositoryMock } = vi.hoisted(() => ({
  repositoryMock: {
    createCorrectionAudit: vi.fn(),
  },
}));

vi.mock('./correction-audit.repository', () => ({
  CorrectionAuditRepository: repositoryMock,
}));

const auditInput = {
  recordType: FinancialCorrectionRecordType.DEBT,
  recordId: '33333333-3333-4333-8333-333333333333',
  customerId: '22222222-2222-4222-8222-222222222222',
  action: FinancialCorrectionAction.CORRECT_DETAILS,
  correctedById: '11111111-1111-4111-8111-111111111111',
  correctedByName: 'Admin User',
  correctedByUsername: 'admin',
  reason: ' Correct typo ',
  beforeValues: { description: 'Old' },
  afterValues: { description: 'New' },
  affectedTotals: { customerOutstandingBefore: '100.00', customerOutstandingAfter: '100.00' },
  sourceScreen: FinancialCorrectionSourceScreen.LEDGER,
  requestId: 'request-1',
  ipAddress: '127.0.0.1',
};

describe('writeFinancialCorrectionAudit', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    repositoryMock.createCorrectionAudit.mockResolvedValue({ id: 'audit-1' });
  });

  it('validates and trims the correction reason before writing audit data', async () => {
    await writeFinancialCorrectionAudit(auditInput);

    expect(repositoryMock.createCorrectionAudit).toHaveBeenCalledWith(
      {
        ...auditInput,
        reason: 'Correct typo',
      },
      undefined
    );
  });

  it('rejects missing before/after JSON objects', async () => {
    await expect(
      writeFinancialCorrectionAudit({
        ...auditInput,
        beforeValues: [] as any,
      })
    ).rejects.toThrow(ValidationError);

    expect(repositoryMock.createCorrectionAudit).not.toHaveBeenCalled();
  });
});
