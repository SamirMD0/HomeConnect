import { Prisma, ServiceAuditAction, ServiceAuditRecordType } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
import { verifyAdminPassword } from '../../../lib/admin-verification';
import { AppError, NotFoundError } from '../../../lib/errors';
import { runFinancialTransaction } from '../../financial/infrastructure/transaction';
import { assertPricingAdmin } from '../../pricing/authorization/pricing-policy';
import { writeServiceAudit } from '../../service/audit/service-audit';
import { RequestContext, ServiceMutationUser } from '../../service/domain/service-types';
import { parseTemplateConfig } from './pricing-card-template-config.z';
import { PricingCardTemplateRepository } from './template.repository';
import { ArchivePricingCardTemplateInput, PricingCardTemplateInput } from './template.validator';

type TemplateRecord = NonNullable<Awaited<ReturnType<typeof PricingCardTemplateRepository.findById>>>;

export class PricingCardTemplateService {
  static async listTemplates(options: { activeOnly: boolean }) { return Promise.all((await PricingCardTemplateRepository.list(options.activeOnly)).map(serialize)); }
  static async getTemplate(id: string) { const row = await PricingCardTemplateRepository.findById(id); if (!row) throw new NotFoundError('Pricing card template not found'); return serialize(row); }
  static createTemplate(input: PricingCardTemplateInput, user: ServiceMutationUser, context: RequestContext) { return this.save(null, input, user, context); }
  static updateTemplate(id: string, input: PricingCardTemplateInput, user: ServiceMutationUser, context: RequestContext) { return this.save(id, input, user, context); }

  static async archiveTemplate(id: string, input: ArchivePricingCardTemplateInput, user: ServiceMutationUser, context: RequestContext) {
    assertPricingAdmin(user);
    return runFinancialTransaction(async (tx) => {
      await verify(user, input.accountPassword, 'ARCHIVE_PRICING_CARD_TEMPLATE', id, context, tx);
      const existing = await PricingCardTemplateRepository.findById(id, tx);
      if (!existing) throw new NotFoundError('Pricing card template not found');
      const saved = await PricingCardTemplateRepository.update(id, { isActive: false, archivedAt: new Date(), archivedReason: input.reason, updatedBy: { connect: { id: user.userId } } }, tx);
      await audit(user, context, existing, saved, ServiceAuditAction.ARCHIVE, input.reason, tx);
      return serialize(saved);
    });
  }

  private static async save(id: string | null, input: PricingCardTemplateInput, user: ServiceMutationUser, context: RequestContext) {
    assertPricingAdmin(user);
    const config = parseTemplateConfig(input.config);
    return runFinancialTransaction(async (tx) => {
      await verify(user, input.accountPassword, id ? 'UPDATE_PRICING_CARD_TEMPLATE' : 'CREATE_PRICING_CARD_TEMPLATE', id ?? input.name, context, tx);
      const existing = id ? await PricingCardTemplateRepository.findById(id, tx) : null;
      if (id && !existing) throw new NotFoundError('Pricing card template not found');
      const collision = await PricingCardTemplateRepository.findByName(input.name, tx);
      if (collision && collision.id !== id) throw new AppError('Pricing card template name already exists', 409, 'PRICING_CARD_TEMPLATE_CONFLICT');
      const data = {
        name: input.name, description: input.description ?? null, paperMode: input.paperMode, paperSize: input.paperSize ?? null,
        cardWidthMm: new Decimal(input.cardWidthMm), cardHeightMm: new Decimal(input.cardHeightMm), configVersion: config.configVersion,
        config: config as Prisma.InputJsonObject, featureMax: input.featureMax, specKeyOrder: input.specKeyOrder,
        defaultValidityDays: input.defaultValidityDays ?? null, isActive: true, archivedAt: null, archivedReason: null,
      };
      const saved = existing
        ? await PricingCardTemplateRepository.update(existing.id, { ...data, updatedBy: { connect: { id: user.userId } } }, tx)
        : await PricingCardTemplateRepository.create({ ...data, createdById: user.userId, updatedById: user.userId }, tx);
      await audit(user, context, existing, saved, existing ? ServiceAuditAction.UPDATE_DETAILS : ServiceAuditAction.CREATE, 'Pricing card template changed', tx);
      return serialize(saved);
    });
  }
}

async function serialize(row: TemplateRecord) { return { id: row.id, name: row.name, description: row.description, paperMode: row.paperMode, paperSize: row.paperSize, cardWidthMm: row.cardWidthMm.toString(), cardHeightMm: row.cardHeightMm.toString(), configVersion: row.configVersion, config: parseTemplateConfig(row.config), featureMax: row.featureMax, specKeyOrder: row.specKeyOrder, defaultValidityDays: row.defaultValidityDays, isActive: row.isActive, archivedAt: row.archivedAt, archivedReason: row.archivedReason }; }
const snapshot = (row: TemplateRecord | null): Prisma.InputJsonObject => row ? { id: row.id, name: row.name, paperMode: row.paperMode, paperSize: row.paperSize, cardWidthMm: row.cardWidthMm.toString(), cardHeightMm: row.cardHeightMm.toString(), configVersion: row.configVersion, featureMax: row.featureMax, specKeyOrder: row.specKeyOrder, defaultValidityDays: row.defaultValidityDays, isActive: row.isActive } : {};
async function verify(user: ServiceMutationUser, password: string, action: string, recordId: string, context: RequestContext, tx: Prisma.TransactionClient) { return verifyAdminPassword(user.userId, password, { action, recordType: 'PRICING_CARD_TEMPLATE', recordId, ipAddress: context.ipAddress, domainLabel: 'pricing card templates' }, tx); }
async function audit(user: ServiceMutationUser, context: RequestContext, before: TemplateRecord | null, after: TemplateRecord, action: ServiceAuditAction, reason: string, tx: Prisma.TransactionClient) { const actor = await tx.user.findUnique({ where: { id: user.userId }, select: { fullName: true, username: true } }); if (!actor) throw new NotFoundError('User not found'); return writeServiceAudit({ recordType: ServiceAuditRecordType.PRICING_CARD_TEMPLATE, recordId: after.id, action, changedById: user.userId, changedByName: actor.fullName, changedByUsername: actor.username, reason, beforeValues: snapshot(before), afterValues: snapshot(after), requestId: context.requestId, ipAddress: context.ipAddress }, tx); }
