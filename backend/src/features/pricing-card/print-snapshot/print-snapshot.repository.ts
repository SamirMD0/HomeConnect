import { Prisma } from '@prisma/client';
import { prisma } from '../../../lib/prisma';
import { SHOP_PROFILE_ID } from '../../shop/shop-profile.repository';

export class PrintSnapshotRepository {
  static getShopProfile(tx: Prisma.TransactionClient) {
    return tx.shopProfile.findUnique({ where: { id: SHOP_PROFILE_ID }, select: { snapshotPrintedCards: true } });
  }
  static findProduct(id: string, tx: Prisma.TransactionClient) {
    return tx.product.findUnique({ where: { id }, select: { id: true } });
  }
  static findTemplate(id: string, tx: Prisma.TransactionClient) {
    return tx.pricingCardTemplate.findUnique({ where: { id }, select: { id: true } });
  }
  static create(data: Prisma.PricingCardPrintUncheckedCreateInput, tx: Prisma.TransactionClient) {
    return tx.pricingCardPrint.create({ data });
  }
  static listForProduct(productId: string, limit: number) {
    return prisma.pricingCardPrint.findMany({
      where: { productId },
      orderBy: [{ generatedAt: 'desc' }, { id: 'desc' }],
      take: limit,
    });
  }
}
