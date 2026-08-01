import { Prisma, PricingPreset, ServiceAuditAction, ServiceAuditRecordType } from '@prisma/client';
import { verifyAdminPassword } from '../../../lib/admin-verification';
import { AppError, NotFoundError, ValidationError } from '../../../lib/errors';
import { runFinancialTransaction } from '../../financial/infrastructure/transaction';
import { writeServiceAudit } from '../../service/audit/service-audit';
import { ServiceAuditRepository } from '../../service/audit/service-audit.repository';
import { RequestContext, ServiceMutationUser } from '../../service/domain/service-types';
import { assertPricingAdmin, containsSensitivePricingPresetFields } from '../authorization/pricing-policy';
import { percentToApiString, parsePricingPercent } from '../domain/pricing-percent';
import {
  CreatePricingPresetInput, PricingPresetActionInput, PricingPresetAuditQueryInput,
  PricingPresetListQueryInput, UpdatePricingPresetInput, mutationFields,
} from './pricing-presets.validator';
import { PricingPresetsRepository } from './pricing-presets.repository';

export class PricingPresetsService {
  static async list(query: PricingPresetListQueryInput) {
    const result = await PricingPresetsRepository.list({ ...query, skip: (query.page - 1) * query.pageSize, take: query.pageSize });
    return { ...result, items: result.items.map(serializePreset), page: query.page, pageSize: query.pageSize };
  }

  static async get(id: string) {
    return serializePreset(await requiredPreset(id));
  }

  static async create(input: CreatePricingPresetInput, user: ServiceMutationUser, context: RequestContext) {
    assertPricingAdmin(user);
    return runFinancialTransaction(async (tx) => {
      if (await PricingPresetsRepository.findDuplicateName(input.name, undefined, tx)) throw duplicateName();
      await verify(user.userId, input.accountPassword, 'CREATE_PRICING_PRESET', undefined, context, tx);
      const preset = await PricingPresetsRepository.create({
        name: input.name, productType: input.productType ?? null,
        expensePercent: parsePricingPercent(input.expensePercent), profitPercent: parsePricingPercent(input.profitPercent),
        discountBufferPercent: parsePricingPercent(input.discountBufferPercent), installmentMarkupPercent: parsePricingPercent(input.installmentMarkupPercent),
        downPaymentPercent: parsePricingPercent(input.downPaymentPercent), defaultInstallmentMonths: input.defaultInstallmentMonths,
        calculationMode: input.calculationMode, roundingMode: input.roundingMode, notes: input.notes ?? null, createdById: user.userId,
      }, tx);
      await audit(preset.id, ServiceAuditAction.CREATE, user.userId, input.reason, {}, presetSnapshot(preset), context, tx);
      return serializePreset(preset);
    });
  }

  static async update(id: string, input: UpdatePricingPresetInput, user: ServiceMutationUser, context: RequestContext) {
    assertPricingAdmin(user);
    const fields = mutationFields(input);
    if (!fields.length) throw new ValidationError('At least one preset field is required');
    const sensitive = containsSensitivePricingPresetFields(fields);
    return runFinancialTransaction(async (tx) => {
      const existing = await requiredPreset(id, tx);
      if (input.name && input.name !== existing.name && await PricingPresetsRepository.findDuplicateName(input.name, id, tx)) throw duplicateName();
      if (sensitive) await verify(user.userId, input.accountPassword!, 'UPDATE_PRICING_PRESET', id, context, tx);
      const updated = await PricingPresetsRepository.update(id, updateData(input, user.userId), tx);
      await audit(id, ServiceAuditAction.UPDATE_DETAILS, user.userId, input.reason, changedSnapshot(existing, fields), changedSnapshot(updated, fields), context, tx);
      return serializePreset(updated);
    });
  }

  static archive(id: string, input: PricingPresetActionInput, user: ServiceMutationUser, context: RequestContext) {
    return this.setActive(id, false, ServiceAuditAction.ARCHIVE, input, user, context);
  }

  static restore(id: string, input: PricingPresetActionInput, user: ServiceMutationUser, context: RequestContext) {
    return this.setActive(id, true, ServiceAuditAction.RESTORE, input, user, context);
  }

  static async setDefault(id: string, input: PricingPresetActionInput, user: ServiceMutationUser, context: RequestContext) {
    assertPricingAdmin(user);
    return runFinancialTransaction(async (tx) => {
      const existing = await requiredPreset(id, tx);
      if (!existing.isActive || existing.archivedAt) throw new AppError('Only an active preset can be the default', 409, 'PRICING_PRESET_INACTIVE');
      await verify(user.userId, input.accountPassword, 'SET_DEFAULT_PRICING_PRESET', id, context, tx);
      await PricingPresetsRepository.clearDefault(id, tx);
      const updated = await PricingPresetsRepository.update(id, { isDefault: true, updatedById: user.userId }, tx);
      await audit(id, ServiceAuditAction.SET_DEFAULT, user.userId, input.reason, { isDefault: existing.isDefault }, { isDefault: true }, context, tx);
      return serializePreset(updated);
    });
  }

  static async audit(id: string, query: PricingPresetAuditQueryInput) {
    await requiredPreset(id);
    const items = await ServiceAuditRepository.list(ServiceAuditRecordType.PRICING_PRESET, id, (query.page - 1) * query.pageSize, query.pageSize);
    return { items, total: items.length, page: query.page, pageSize: query.pageSize };
  }

  private static async setActive(id: string, active: boolean, action: ServiceAuditAction, input: PricingPresetActionInput, user: ServiceMutationUser, context: RequestContext) {
    assertPricingAdmin(user);
    return runFinancialTransaction(async (tx) => {
      const existing = await requiredPreset(id, tx);
      if (existing.isActive === active) throw new AppError(`Pricing preset is already ${active ? 'active' : 'archived'}`, 409, 'PRICING_PRESET_STATE_CONFLICT');
      if (!active && existing.isDefault) throw new AppError('Set another default before archiving this preset', 409, 'DEFAULT_PRICING_PRESET');
      await verify(user.userId, input.accountPassword, active ? 'RESTORE_PRICING_PRESET' : 'ARCHIVE_PRICING_PRESET', id, context, tx);
      const updated = await PricingPresetsRepository.update(id, {
        isActive: active, archivedAt: active ? null : new Date(), archivedReason: active ? null : input.reason, updatedById: user.userId,
      }, tx);
      await audit(id, action, user.userId, input.reason, { isActive: existing.isActive, archivedAt: existing.archivedAt?.toISOString() ?? null }, { isActive: updated.isActive, archivedAt: updated.archivedAt?.toISOString() ?? null }, context, tx);
      return serializePreset(updated);
    });
  }
}

async function requiredPreset(id: string, tx?: Prisma.TransactionClient) {
  const preset = await PricingPresetsRepository.findById(id, tx);
  if (!preset) throw new NotFoundError('Pricing preset not found');
  return preset;
}
function updateData(input: UpdatePricingPresetInput, updatedById: string): Prisma.PricingPresetUncheckedUpdateInput {
  const data: Prisma.PricingPresetUncheckedUpdateInput = { updatedById };
  if (input.name !== undefined) data.name = input.name;
  if (input.productType !== undefined) data.productType = input.productType;
  for (const field of ['expensePercent','profitPercent','discountBufferPercent','installmentMarkupPercent','downPaymentPercent'] as const) if (input[field] !== undefined) data[field] = parsePricingPercent(input[field]!);
  if (input.defaultInstallmentMonths !== undefined) data.defaultInstallmentMonths = input.defaultInstallmentMonths;
  if (input.calculationMode !== undefined) data.calculationMode = input.calculationMode;
  if (input.roundingMode !== undefined) data.roundingMode = input.roundingMode;
  if (input.notes !== undefined) data.notes = input.notes;
  return data;
}
type PresetRecord = PricingPreset & { createdBy?: { fullName: string; username: string }; updatedBy?: { fullName: string; username: string } | null };
export function serializePreset(preset: PresetRecord) {
  return { ...preset,
    expensePercent: percentToApiString(preset.expensePercent), profitPercent: percentToApiString(preset.profitPercent),
    discountBufferPercent: percentToApiString(preset.discountBufferPercent), installmentMarkupPercent: percentToApiString(preset.installmentMarkupPercent),
    downPaymentPercent: percentToApiString(preset.downPaymentPercent), isArchived: Boolean(preset.archivedAt),
  };
}
function presetSnapshot(preset: PricingPreset): Prisma.InputJsonObject { return {
  name: preset.name, productType: preset.productType, expensePercent: percentToApiString(preset.expensePercent), profitPercent: percentToApiString(preset.profitPercent),
  discountBufferPercent: percentToApiString(preset.discountBufferPercent), installmentMarkupPercent: percentToApiString(preset.installmentMarkupPercent),
  downPaymentPercent: percentToApiString(preset.downPaymentPercent), defaultInstallmentMonths: preset.defaultInstallmentMonths,
  calculationMode: preset.calculationMode, roundingMode: preset.roundingMode, isDefault: preset.isDefault, isActive: preset.isActive, notes: preset.notes,
}; }
function changedSnapshot(preset: PricingPreset, fields: string[]): Prisma.InputJsonObject { const snap = presetSnapshot(preset); return Object.fromEntries(fields.map((field) => [field, snap[field] ?? null])); }
async function audit(id: string, action: ServiceAuditAction, userId: string, reason: string, beforeValues: Prisma.InputJsonObject, afterValues: Prisma.InputJsonObject, context: RequestContext, tx: Prisma.TransactionClient) {
  const actor = await tx.user.findUnique({ where: { id: userId }, select: { fullName: true, username: true } });
  if (!actor) throw new NotFoundError('User not found');
  return writeServiceAudit({ recordType: ServiceAuditRecordType.PRICING_PRESET, recordId: id, action, changedById: userId, changedByName: actor.fullName, changedByUsername: actor.username, reason, beforeValues, afterValues, requestId: context.requestId, ipAddress: context.ipAddress }, tx);
}
function verify(userId: string, password: string, action: string, id: string | undefined, context: RequestContext, tx: Prisma.TransactionClient) { return verifyAdminPassword(userId, password, { action, recordType: 'PRICING_PRESET', recordId: id, ipAddress: context.ipAddress, domainLabel: 'pricing changes' }, tx); }
function duplicateName() { return new AppError('An active pricing preset with this name already exists', 409, 'PRICING_PRESET_NAME_CONFLICT'); }
