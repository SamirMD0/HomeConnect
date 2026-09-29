import { Prisma } from '@prisma/client';
import { NotFoundError } from '../../lib/errors';
import { prisma } from '../../lib/prisma';

const effectiveTaxInclude = { taxRate: true } satisfies Prisma.TaxProfileInclude;

export type EffectiveTaxProfile = Prisma.TaxProfileGetPayload<{ include: typeof effectiveTaxInclude }>;

export class TaxRepository {
  static findEffectiveProfile(
    taxProfileId: string | null | undefined,
    effectiveOn: Date,
    tx?: Prisma.TransactionClient
  ) {
    const client = tx ?? prisma;
    return client.taxProfile.findFirst({
      where: {
        ...(taxProfileId ? { id: taxProfileId } : { isDefault: true }),
        isActive: true,
        taxRate: {
          is: {
            isActive: true,
            effectiveFrom: { lte: effectiveOn },
            OR: [{ effectiveTo: null }, { effectiveTo: { gte: effectiveOn } }],
          },
        },
      },
      include: effectiveTaxInclude,
    });
  }

  static async requireEffectiveProfile(
    taxProfileId: string | null | undefined,
    effectiveOn: Date,
    tx?: Prisma.TransactionClient
  ): Promise<EffectiveTaxProfile> {
    const profile = await this.findEffectiveProfile(taxProfileId, effectiveOn, tx);
    if (!profile) {
      throw new NotFoundError(taxProfileId
        ? 'No active tax rate is effective for this product tax profile'
        : 'No active default tax profile with an effective rate is configured');
    }
    return profile;
  }

  static async requireEffectiveZeroRatedProfile(
    effectiveOn: Date,
    tx?: Prisma.TransactionClient
  ): Promise<EffectiveTaxProfile> {
    const profile = await (tx ?? prisma).taxProfile.findFirst({
      where: {
        isActive: true,
        taxRate: {
          is: {
            isActive: true,
            ratePercent: 0,
            effectiveFrom: { lte: effectiveOn },
            OR: [{ effectiveTo: null }, { effectiveTo: { gte: effectiveOn } }],
          },
        },
      },
      include: effectiveTaxInclude,
      orderBy: [{ isDefault: 'desc' }, { code: 'asc' }],
    });
    if (!profile) throw new NotFoundError('No active zero-rated tax profile is effective for delivery');
    return profile;
  }
}
