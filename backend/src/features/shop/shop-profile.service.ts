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
      const { accountPassword: _accountPassword, ...changes } = input;
      const updated = await ShopProfileRepository.updateSingleton({ ...changes, updatedBy: { connect: { id: user.userId } } }, tx);
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

function serialize(profile: ShopProfileRecord): ShopProfileDto {
  return {
    id: profile.id,
    name: profile.name,
    tagline: profile.tagline,
    hasLogo: Boolean(profile.logoBytes?.length),
    logoMimeType: profile.logoMimeType,
    logoByteSize: profile.logoByteSize,
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
  return { ...serialized } as Prisma.InputJsonObject;
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
