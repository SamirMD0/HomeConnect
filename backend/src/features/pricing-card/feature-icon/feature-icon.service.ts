import { Prisma, ServiceAuditAction, ServiceAuditRecordType } from '@prisma/client';
import { verifyAdminPassword } from '../../../lib/admin-verification';
import { AppError, NotFoundError } from '../../../lib/errors';
import { runFinancialTransaction } from '../../financial/infrastructure/transaction';
import { assertPricingAdmin } from '../../pricing/authorization/pricing-policy';
import { writeServiceAudit } from '../../service/audit/service-audit';
import { RequestContext, ServiceMutationUser } from '../../service/domain/service-types';
import { FeatureIconRepository } from './feature-icon.repository';
import { sanitizeSvg } from './sanitize-svg';
import { ArchiveFeatureIconInput, FeatureIconInput } from './feature-icon.validator';

type IconRecord = NonNullable<Awaited<ReturnType<typeof FeatureIconRepository.findById>>>;

export class FeatureIconService {
  static listFeatureIcons(options: { activeOnly?: boolean; category?: string }) { return FeatureIconRepository.list(options); }
  static getByCode(code: string) { return FeatureIconRepository.getByCode(code); }
  static createFeatureIcon(input: FeatureIconInput, user: ServiceMutationUser, context: RequestContext) { return this.save(null, input, user, context); }
  static updateFeatureIcon(id: string, input: FeatureIconInput, user: ServiceMutationUser, context: RequestContext) { return this.save(id, input, user, context); }

  static async archiveFeatureIcon(id: string, input: ArchiveFeatureIconInput, user: ServiceMutationUser, context: RequestContext) {
    assertPricingAdmin(user);
    return runFinancialTransaction(async (tx) => {
      await verify(user, input.accountPassword, 'ARCHIVE_PRICING_CARD_FEATURE_ICON', id, context, tx);
      const existing = await FeatureIconRepository.findById(id, tx);
      if (!existing) throw new NotFoundError('Pricing card feature icon not found');
      const saved = await FeatureIconRepository.update(id, { isActive: false, updatedBy: { connect: { id: user.userId } } }, tx);
      await audit(user, context, existing, saved, ServiceAuditAction.ARCHIVE, tx);
      return saved;
    });
  }

  private static async save(id: string | null, input: FeatureIconInput, user: ServiceMutationUser, context: RequestContext) {
    assertPricingAdmin(user);
    const cleanSvg = sanitizeSvg(input.svg);
    return runFinancialTransaction(async (tx) => {
      await verify(user, input.accountPassword, id ? 'UPDATE_PRICING_CARD_FEATURE_ICON' : 'CREATE_PRICING_CARD_FEATURE_ICON', id ?? input.code, context, tx);
      const existing = id ? await FeatureIconRepository.findById(id, tx) : null;
      if (id && !existing) throw new NotFoundError('Pricing card feature icon not found');
      const collision = await FeatureIconRepository.getByCode(input.code, tx);
      if (collision && collision.id !== id) throw new AppError('Feature icon code already exists', 409, 'FEATURE_ICON_CONFLICT');
      const data = { code: input.code, label: input.label, category: input.category ?? null, svg: cleanSvg, sortOrder: input.sortOrder, isActive: input.isActive };
      const saved = existing
        ? await FeatureIconRepository.update(existing.id, { ...data, updatedBy: { connect: { id: user.userId } } }, tx)
        : await FeatureIconRepository.create({ ...data, createdById: user.userId, updatedById: user.userId }, tx);
      await audit(user, context, existing, saved, existing ? ServiceAuditAction.UPDATE_DETAILS : ServiceAuditAction.CREATE, tx);
      return saved;
    });
  }
}

const snapshot = (row: IconRecord | null): Prisma.InputJsonObject => row ? { id: row.id, code: row.code, label: row.label, category: row.category, svg: row.svg, isActive: row.isActive, sortOrder: row.sortOrder } : {};
async function verify(user: ServiceMutationUser, password: string, action: string, recordId: string, context: RequestContext, tx: Prisma.TransactionClient) { return verifyAdminPassword(user.userId, password, { action, recordType: 'PRICING_CARD_FEATURE_ICON', recordId, ipAddress: context.ipAddress, domainLabel: 'pricing card feature icons' }, tx); }
async function audit(user: ServiceMutationUser, context: RequestContext, before: IconRecord | null, after: IconRecord, action: ServiceAuditAction, tx: Prisma.TransactionClient) {
  const actor = await tx.user.findUnique({ where: { id: user.userId }, select: { fullName: true, username: true } });
  if (!actor) throw new NotFoundError('User not found');
  return writeServiceAudit({ recordType: ServiceAuditRecordType.PRICING_CARD_FEATURE_ICON, recordId: after.id, action, changedById: user.userId, changedByName: actor.fullName, changedByUsername: actor.username, reason: action === ServiceAuditAction.ARCHIVE ? 'Pricing card feature icon archived' : 'Pricing card feature icon changed', beforeValues: snapshot(before), afterValues: snapshot(after), requestId: context.requestId, ipAddress: context.ipAddress }, tx);
}
