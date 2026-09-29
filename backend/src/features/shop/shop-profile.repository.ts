import { Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma';

export const SHOP_PROFILE_ID = '4c2b1e9f-8c4b-4a2f-8a10-30c9a04c6d21';

export class ShopProfileRepository {
  static findSingleton(tx?: Prisma.TransactionClient) {
    return (tx ?? prisma).shopProfile.findUnique({ where: { id: SHOP_PROFILE_ID } });
  }

  static updateSingleton(data: Prisma.ShopProfileUpdateInput, tx?: Prisma.TransactionClient) {
    return (tx ?? prisma).shopProfile.update({ where: { id: SHOP_PROFILE_ID }, data });
  }
}
