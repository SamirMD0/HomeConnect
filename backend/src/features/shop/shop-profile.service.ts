import { Prisma, ServiceAuditAction, ServiceAuditRecordType } from '@prisma/client';
import { verifyAdminPassword } from '../../lib/admin-verification';
import { NotFoundError } from '../../lib/errors';
import { runFinancialTransaction } from '../financial/infrastructure/transaction';
import { writeServiceAudit } from '../service/audit/service-audit';
import { RequestContext, ServiceMutationUser } from '../service/domain/service-types';
import { assertPricingAdmin } from '../pricing/authorization/pricing-policy';
import { SHOP_PROFILE_ID, ShopProfileRepository } from './shop-profile.repository';
import { ShopProfileDto } from './shop-profile.types';
import { UpdateShopProfileInput } from './shop-profile.validator';

type ShopProfileRecord = NonNullable<Awaited<ReturnType<typeof ShopProfileRepository.findSingleton>>>;

export class ShopProfileService {
  static async getShopProfile(): Promise<ShopProfileDto> {
    const profile = await ShopProfileRepository.findSingleton();
    if (!profile) throw new NotFoundError('Shop profile not found');
    return serialize(profile);
  }

  static async updateShopProfile(input: UpdateShopProfileInput, user: ServiceMutationUser, context: RequestContext): Promise<ShopProfileDto> {
    assertPricingAdmin(user);
    return runFinancialTransaction(async (tx) => {
      await verify(user, input.accountPassword, 'UPDATE_SHOP_PROFILE', context, tx);
      const existing = await ShopProfileRepository.findSingleton(tx);
      if (!existing) throw new NotFoundError('Shop profile not found');
      const updated = await ShopProfileRepository.updateSingleton({ ...toUpdateData(input), updatedBy: { connect: { id: user.userId } } }, tx);
      await audit(user, context, snapshot(existing), snapshot(updated), 'Shop profile details changed', tx);
      return serialize(updated);
    });
  }

  static async updateShopProfileLogo(bytes: Buffer, mimeType: string, accountPassword: string, user: ServiceMutationUser, context: RequestContext): Promise<ShopProfileDto> {
    assertPricingAdmin(user);
    return runFinancialTransaction(async (tx) => {
      await verify(user, accountPassword, 'UPDATE_SHOP_PROFILE_LOGO', context, tx);
      const existing = await ShopProfileRepository.findSingleton(tx);
      if (!existing) throw new NotFoundError('Shop profile not found');
      const updated = await ShopProfileRepository.updateSingleton({
        logoBytes: bytes,
        logoMimeType: mimeType,
        logoByteSize: bytes.length,
        updatedBy: { connect: { id: user.userId } },
      }, tx);
      await audit(user, context, snapshot(existing), snapshot(updated), 'Shop profile logo changed', tx);
      return serialize(updated);
    });
  }
}

// Mapped field by field on purpose: `defaultPricingCardTemplateId` is the foreign key behind the
// `defaultPricingCardTemplate` relation, so Prisma's checked update input only accepts it as a nested
// relation write. Spreading the validated body here would smuggle the scalar past the compiler.
function toUpdateData(input: UpdateShopProfileInput): Prisma.ShopProfileUpdateInput {
  return {
    name: input.name,
    tagline: input.tagline,
    currencyCode: input.currencyCode,
    currencyDisplay: input.currencyDisplay,
    defaultCardValidityDays: input.defaultCardValidityDays,
    snapshotPrintedCards: input.snapshotPrintedCards,
    pricingCardRolloutMode: input.pricingCardRolloutMode,
    ...(input.defaultPricingCardTemplateId === undefined ? {} : {
      defaultPricingCardTemplate: input.defaultPricingCardTemplateId === null
        ? { disconnect: true }
        : { connect: { id: input.defaultPricingCardTemplateId } },
    }),
  };
}

function serialize(profile: ShopProfileRecord): ShopProfileDto {
  const hasLogo = Boolean(profile.logoBytes?.length);
  return {
    id: profile.id,
    name: profile.name,
    tagline: profile.tagline,
    hasLogo,
    logoMimeType: profile.logoMimeType,
    logoByteSize: profile.logoByteSize,
    logoDataUrl: hasLogo && profile.logoMimeType
      ? `data:${profile.logoMimeType};base64,${Buffer.from(profile.logoBytes!).toString('base64')}`
      : null,
    currencyCode: profile.currencyCode,
    currencyDisplay: profile.currencyDisplay,
    defaultPricingCardTemplateId: profile.defaultPricingCardTemplateId,
    defaultCardValidityDays: profile.defaultCardValidityDays,
    snapshotPrintedCards: profile.snapshotPrintedCards,
    pricingCardRolloutMode: profile.pricingCardRolloutMode,
  };
}

function snapshot(profile: ShopProfileRecord): Prisma.InputJsonObject {
  const serialized = serialize(profile);
  const { logoDataUrl: _logoDataUrl, ...rest } = serialized;
  return { ...rest } as Prisma.InputJsonObject;
}

async function verify(user: ServiceMutationUser, password: string, action: string, context: RequestContext, tx: Prisma.TransactionClient) {
  return verifyAdminPassword(user.userId, password, {
    action,
    recordType: 'SHOP_PROFILE',
    recordId: SHOP_PROFILE_ID,
    ipAddress: context.ipAddress,
    domainLabel: 'shop profile settings',
  }, tx);
}

async function audit(user: ServiceMutationUser, context: RequestContext, beforeValues: Prisma.InputJsonObject, afterValues: Prisma.InputJsonObject, reason: string, tx: Prisma.TransactionClient) {
  const actor = await tx.user.findUnique({ where: { id: user.userId }, select: { fullName: true, username: true } });
  if (!actor) throw new NotFoundError('User not found');
  return writeServiceAudit({
    recordType: ServiceAuditRecordType.SHOP_PROFILE,
    recordId: SHOP_PROFILE_ID,
    action: ServiceAuditAction.UPDATE_DETAILS,
    changedById: user.userId,
    changedByName: actor.fullName,
    changedByUsername: actor.username,
    reason,
    beforeValues,
    afterValues,
    requestId: context.requestId,
    ipAddress: context.ipAddress,
  }, tx);
}
