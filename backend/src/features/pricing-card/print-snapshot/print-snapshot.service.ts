import { Prisma, ServiceAuditAction, ServiceAuditRecordType } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
import { NotFoundError } from '../../../lib/errors';
import { runFinancialTransaction } from '../../financial/infrastructure/transaction';
import { assertServiceAdmin } from '../../service/authorization/service-policy';
import { writeServiceAudit } from '../../service/audit/service-audit';
import { RequestContext, ServiceMutationUser } from '../../service/domain/service-types';
import { PrintSnapshotRepository } from './print-snapshot.repository';
import { RecordPrintSnapshotInput } from './print-snapshot.validator';

export class PrintSnapshotService {
  static recordPrint(input: RecordPrintSnapshotInput, user: ServiceMutationUser, context: RequestContext) {
    assertServiceAdmin(user);
    return runFinancialTransaction(async (tx) => {
      const profile = await PrintSnapshotRepository.getShopProfile(tx);
      if (!profile) throw new NotFoundError('Shop profile not found');
      if (!profile.snapshotPrintedCards) return { recorded: false as const, print: null };
      if (!await PrintSnapshotRepository.findProduct(input.productId, tx)) throw new NotFoundError('Product not found');
      if (!await PrintSnapshotRepository.findTemplate(input.templateId, tx)) throw new NotFoundError('Pricing card template not found');

      const print = await PrintSnapshotRepository.create({
        productId: input.productId,
        templateId: input.templateId,
        snapshot: input.snapshot as Prisma.InputJsonObject,
        validUntil: input.validUntil ?? null,
        currencyCode: input.currencyCode,
        publicPrice: new Decimal(input.publicPrice),
        staffLabelCode: input.staffLabelCode ?? null,
        barcodeValue: input.barcodeValue,
        copiesPrinted: input.copiesPrinted,
        generatedById: user.userId,
        hiddenPricingPresetId: input.hiddenPricingPresetId ?? null,
        encodingPresetId: input.encodingPresetId ?? null,
      }, tx);
      const actor = await tx.user.findUnique({ where: { id: user.userId }, select: { fullName: true, username: true } });
      if (!actor) throw new NotFoundError('User not found');
      await writeServiceAudit({
        recordType: ServiceAuditRecordType.PRICING_CARD_PRINT,
        recordId: print.id,
        action: ServiceAuditAction.CREATE,
        changedById: user.userId,
        changedByName: actor.fullName,
        changedByUsername: actor.username,
        reason: 'Pricing card print snapshot recorded',
        beforeValues: {},
        afterValues: snapshotForAudit(print),
        requestId: context.requestId,
        ipAddress: context.ipAddress,
      }, tx);
      return { recorded: true as const, print: serialize(print) };
    });
  }

  static async listPrintsForProduct(productId: string, limit: number) {
    return (await PrintSnapshotRepository.listForProduct(productId, limit)).map(serialize);
  }
}

type PrintRecord = Awaited<ReturnType<typeof PrintSnapshotRepository.create>>;
const serialize = (row: PrintRecord) => ({
  ...row,
  publicPrice: row.publicPrice.toString(),
});
const snapshotForAudit = (row: PrintRecord): Prisma.InputJsonObject => ({
  productId: row.productId,
  templateId: row.templateId,
  validUntil: row.validUntil?.toISOString().slice(0, 10) ?? null,
  currencyCode: row.currencyCode,
  publicPrice: row.publicPrice.toString(),
  staffLabelCode: row.staffLabelCode,
  barcodeValue: row.barcodeValue,
  copiesPrinted: row.copiesPrinted,
  generatedById: row.generatedById,
  hiddenPricingPresetId: row.hiddenPricingPresetId,
  encodingPresetId: row.encodingPresetId,
});
