import { Prisma, ServiceAuditAction, ServiceAuditRecordType } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
import { verifyAdminPassword } from '../../../lib/admin-verification';
import { AppError, NotFoundError } from '../../../lib/errors';
import { runFinancialTransaction } from '../../financial/infrastructure/transaction';
import { writeServiceAudit } from '../../service/audit/service-audit';
import { RequestContext, ServiceMutationUser } from '../../service/domain/service-types';
import { assertPricingAdmin } from '../authorization/pricing-policy';
import { LabelSecretConfigRepository, LABEL_SECRET_SETTINGS_ID } from './label-secret-config.repository';
import { LabelSecretEncodingInput, UpdateLabelSecretSettingsInput } from './label-secret-config.validator';

export class LabelSecretConfigService {
  static async get() {
    const [settings, availablePricingPresets, encodingPresets] = await Promise.all([
      LabelSecretConfigRepository.settings(),
      LabelSecretConfigRepository.availablePresets(),
      LabelSecretConfigRepository.encodings(),
    ]);
    return serialize(settings, availablePricingPresets, encodingPresets);
  }

  static async updateSettings(input: UpdateLabelSecretSettingsInput, user: ServiceMutationUser, context: RequestContext) {
    assertPricingAdmin(user);
    return runFinancialTransaction(async (tx) => {
      await verify(user, input.accountPassword, 'UPDATE_LABEL_SECRET_SETTINGS', context, tx);
      const existing = await LabelSecretConfigRepository.settings(tx);
      const previouslyAllowed = await LabelSecretConfigRepository.allowedPresets(tx);
      const presets = await tx.pricingPreset.findMany({ where: { id: { in: input.allowedPricingPresetIds }, isActive: true, archivedAt: null } });
      if (presets.length !== new Set(input.allowedPricingPresetIds).size) throw new AppError('Every allowed hidden pricing preset must be active', 409, 'LABEL_SECRET_PRESET_INVALID');
      if (input.defaultEncodingPresetId) {
        const encoding = await tx.labelSecretEncodingPreset.findFirst({ where: { id: input.defaultEncodingPresetId, isActive: true } });
        if (!encoding) throw new AppError('The default encoding preset must be active', 409, 'LABEL_SECRET_ENCODING_INVALID');
      }
      await tx.pricingPreset.updateMany({ where: { isLabelSecretAllowed: true }, data: { isLabelSecretAllowed: false } });
      if (input.allowedPricingPresetIds.length) await tx.pricingPreset.updateMany({ where: { id: { in: input.allowedPricingPresetIds } }, data: { isLabelSecretAllowed: true } });
      const updated = await tx.labelSecretSettings.upsert({
        where: { id: LABEL_SECRET_SETTINGS_ID },
        create: {
          id: LABEL_SECRET_SETTINGS_ID,
          defaultPricingPresetId: input.defaultPricingPresetId,
          defaultEncodingPresetId: input.defaultEncodingPresetId,
          showCodeOnLabel: input.showCodeOnLabel,
          updatedById: user.userId,
        },
        update: {
          defaultPricingPresetId: input.defaultPricingPresetId,
          defaultEncodingPresetId: input.defaultEncodingPresetId,
          showCodeOnLabel: input.showCodeOnLabel,
          updatedById: user.userId,
        },
      });
      await audit(user, context, snapshot(existing, previouslyAllowed), snapshot(updated, presets), tx);
      return this.getWithTransaction(tx);
    });
  }

  static async createEncoding(input: LabelSecretEncodingInput, user: ServiceMutationUser, context: RequestContext) {
    return this.saveEncoding(null, input, user, context);
  }

  static async updateEncoding(id: string, input: LabelSecretEncodingInput, user: ServiceMutationUser, context: RequestContext) {
    return this.saveEncoding(id, input, user, context);
  }

  private static async saveEncoding(id: string | null, input: LabelSecretEncodingInput, user: ServiceMutationUser, context: RequestContext) {
    assertPricingAdmin(user);
    return runFinancialTransaction(async (tx) => {
      await verify(user, input.accountPassword, id ? 'UPDATE_LABEL_SECRET_ENCODING' : 'CREATE_LABEL_SECRET_ENCODING', context, tx);
      const existing = id ? await LabelSecretConfigRepository.encoding(id, tx) : null;
      if (id && !existing) throw new NotFoundError('Label secret encoding preset not found');
      if (id && !input.isActive) {
        const settings = await tx.labelSecretSettings.findFirst({ where: { defaultEncodingPresetId: id } });
        if (settings) throw new AppError('Choose another default encoding before archiving this one', 409, 'LABEL_SECRET_DEFAULT_ENCODING');
      }
      const data = {
        name: input.name,
        mode: input.mode,
        // Staged codes generate every camouflage letter per preview. Carrying
        // affixes over from another mode would reintroduce a static pattern.
        prefix: input.mode === 'STAGED_DISCOUNT' ? '' : input.prefix,
        suffix: input.mode === 'STAGED_DISCOUNT' ? '' : input.suffix,
        offset: new Decimal(input.offset),
        digitMap: input.mode === 'DIGIT_MAP_PRICE' ? input.digitMap : null,
        decimalPlaces: input.decimalPlaces,
        isActive: input.isActive,
        updatedById: user.userId,
      };
      const saved = existing
        ? await tx.labelSecretEncodingPreset.update({ where: { id: existing.id }, data })
        : await tx.labelSecretEncodingPreset.create({ data: { ...data, createdById: user.userId } });
      await audit(user, context, existing ? encodingSnapshot(existing) : {}, encodingSnapshot(saved), tx);
      return encodingSnapshot(saved);
    });
  }

  private static async getWithTransaction(tx: Prisma.TransactionClient) {
    return serialize(await LabelSecretConfigRepository.settings(tx), await LabelSecretConfigRepository.availablePresets(tx), await LabelSecretConfigRepository.encodings(tx));
  }
}

const encodingSnapshot = (value: { id: string; name: string; mode: string; prefix: string; suffix: string; offset: { toString(): string }; digitMap: string | null; decimalPlaces: number; isActive: boolean }): Prisma.InputJsonObject => ({
  id: value.id, name: value.name, mode: value.mode, prefix: value.prefix, suffix: value.suffix,
  offset: value.offset.toString(), digitMap: value.digitMap, decimalPlaces: value.decimalPlaces, isActive: value.isActive,
});

const snapshot = (settings: { defaultPricingPresetId: string | null; defaultEncodingPresetId: string | null; showCodeOnLabel: boolean } | null, allowed: Array<{ id: string }>): Prisma.InputJsonObject => ({
  defaultPricingPresetId: settings?.defaultPricingPresetId ?? null,
  defaultEncodingPresetId: settings?.defaultEncodingPresetId ?? null,
  showCodeOnLabel: settings?.showCodeOnLabel ?? false,
  allowedPricingPresetIds: allowed.map((preset) => preset.id).sort(),
});

function serialize(settings: Awaited<ReturnType<typeof LabelSecretConfigRepository.settings>>, available: Awaited<ReturnType<typeof LabelSecretConfigRepository.availablePresets>>, encodings: Awaited<ReturnType<typeof LabelSecretConfigRepository.encodings>>) {
  return {
    settings: settings ? {
      id: settings.id,
      defaultPricingPresetId: settings.defaultPricingPresetId,
      defaultEncodingPresetId: settings.defaultEncodingPresetId,
      showCodeOnLabel: settings.showCodeOnLabel,
    } : null,
    availablePricingPresets: available.map((preset) => ({ id: preset.id, name: preset.name })),
    allowedPricingPresets: available.filter((preset) => preset.isLabelSecretAllowed).map((preset) => ({ id: preset.id, name: preset.name })),
    encodingPresets: encodings.map(encodingSnapshot),
  };
}

async function verify(user: ServiceMutationUser, password: string, action: string, context: RequestContext, tx: Prisma.TransactionClient) {
  return verifyAdminPassword(user.userId, password, { action, recordType: 'LABEL_SECRET_SETTINGS', recordId: LABEL_SECRET_SETTINGS_ID, ipAddress: context.ipAddress, domainLabel: 'label secret pricing' }, tx);
}

async function audit(user: ServiceMutationUser, context: RequestContext, beforeValues: Prisma.InputJsonObject, afterValues: Prisma.InputJsonObject, tx: Prisma.TransactionClient) {
  const actor = await tx.user.findUnique({ where: { id: user.userId }, select: { fullName: true, username: true } });
  if (!actor) throw new NotFoundError('User not found');
  return writeServiceAudit({
    recordType: ServiceAuditRecordType.LABEL_SECRET_SETTINGS,
    recordId: LABEL_SECRET_SETTINGS_ID,
    action: ServiceAuditAction.UPDATE_DETAILS,
    changedById: user.userId,
    changedByName: actor.fullName,
    changedByUsername: actor.username,
    reason: 'Label secret pricing configuration changed',
    beforeValues,
    afterValues,
    requestId: context.requestId,
    ipAddress: context.ipAddress,
  }, tx);
}
