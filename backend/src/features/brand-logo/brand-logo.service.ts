import { Prisma, ServiceAuditAction, ServiceAuditRecordType } from '@prisma/client';
import { AppError, NotFoundError, ValidationError } from '../../lib/errors';
import { runFinancialTransaction } from '../financial/infrastructure/transaction';
import { assertPricingAdmin } from '../pricing/authorization/pricing-policy';
import { writeServiceAudit } from '../service/audit/service-audit';
import { RequestContext, ServiceMutationUser } from '../service/domain/service-types';
import { assertProductImageBytes, assertProductImageMimeType } from '../service/products/product-image';
import { MAX_LOGO_BYTES } from '../shop/shop-profile.validator';
import { normalizeBrandKey, normalizeBrandSpelling } from './brand-key';
import { BrandLogoRepository } from './brand-logo.repository';
import { ArchiveBrandLogoInput, BrandLogoInput } from './brand-logo.validator';

type BrandLogoRecord = NonNullable<Awaited<ReturnType<typeof BrandLogoRepository.findById>>>;

export class BrandLogoService {
  static async listBrandLogos(options: { activeOnly: boolean }) {
    return (await BrandLogoRepository.list(options.activeOnly)).map(serialize);
  }

  static getByCanonical(name: string) {
    const key = normalizeBrandKey(name);
    return key ? BrandLogoRepository.findByCanonical(key) : null;
  }

  static createBrandLogo(input: BrandLogoInput, user: ServiceMutationUser, context: RequestContext) {
    return this.save(null, input, user, context);
  }

  static updateBrandLogo(id: string, input: BrandLogoInput, user: ServiceMutationUser, context: RequestContext) {
    return this.save(id, input, user, context);
  }

  static async archiveBrandLogo(id: string, input: ArchiveBrandLogoInput, user: ServiceMutationUser, context: RequestContext) {
    assertPricingAdmin(user);
    return runFinancialTransaction(async (tx) => {
      const existing = await BrandLogoRepository.findById(id, tx);
      if (!existing) throw new NotFoundError('Brand logo not found');
      const saved = await BrandLogoRepository.update(id, { isActive: false }, tx);
      await audit(user, context, existing, saved, ServiceAuditAction.ARCHIVE, tx);
      return serialize(saved);
    });
  }

  private static async save(id: string | null, input: BrandLogoInput, user: ServiceMutationUser, context: RequestContext) {
    assertPricingAdmin(user);
    const displayName = normalizeBrandSpelling(input.displayName)!;
    const canonicalName = normalizeBrandKey(input.canonicalName ?? displayName)!;
    const mimeType = assertProductImageMimeType(input.mimeType);
    const bytes = assertProductImageBytes(Buffer.from(input.dataBase64, 'base64'), mimeType);
    if (bytes.length > MAX_LOGO_BYTES) throw new ValidationError('Brand logo must be 512 KB or smaller');

    return runFinancialTransaction(async (tx) => {
      const existing = id ? await BrandLogoRepository.findById(id, tx) : null;
      if (id && !existing) throw new NotFoundError('Brand logo not found');
      const collision = await BrandLogoRepository.findByCanonical(canonicalName, tx);
      if (collision && collision.id !== id) throw new AppError('A logo already exists for this canonical brand', 409, 'BRAND_LOGO_CONFLICT');
      const data = { canonicalName, displayName, logoBytes: bytes, logoMimeType: mimeType, logoByteSize: bytes.length, isActive: true };
      const saved = existing
        ? await BrandLogoRepository.update(existing.id, data, tx)
        : await BrandLogoRepository.create({ ...data, createdById: user.userId }, tx);
      await audit(user, context, existing, saved, existing ? ServiceAuditAction.UPDATE_DETAILS : ServiceAuditAction.CREATE, tx);
      return serialize(saved);
    });
  }
}

const serialize = (row: BrandLogoRecord) => {
  const hasLogo = Boolean(row.logoBytes?.length);
  return {
    id: row.id, canonicalName: row.canonicalName, displayName: row.displayName,
    hasLogo, logoMimeType: row.logoMimeType, logoByteSize: row.logoByteSize,
    logoDataUrl: hasLogo && row.logoMimeType
      ? `data:${row.logoMimeType};base64,${Buffer.from(row.logoBytes!).toString('base64')}`
      : null,
    isActive: row.isActive,
  };
};

const snapshot = (row: BrandLogoRecord | null): Prisma.InputJsonObject => {
  if (!row) return {};
  const { logoDataUrl: _logoDataUrl, ...rest } = serialize(row);
  return rest;
};

async function audit(user: ServiceMutationUser, context: RequestContext, before: BrandLogoRecord | null, after: BrandLogoRecord, action: ServiceAuditAction, tx: Prisma.TransactionClient) {
  const actor = await tx.user.findUnique({ where: { id: user.userId }, select: { fullName: true, username: true } });
  if (!actor) throw new NotFoundError('User not found');
  return writeServiceAudit({
    recordType: ServiceAuditRecordType.BRAND_LOGO, recordId: after.id, action,
    changedById: user.userId, changedByName: actor.fullName, changedByUsername: actor.username,
    reason: action === ServiceAuditAction.ARCHIVE ? 'Brand logo archived' : 'Brand logo catalog changed',
    beforeValues: snapshot(before), afterValues: snapshot(after), requestId: context.requestId, ipAddress: context.ipAddress,
  }, tx);
}
