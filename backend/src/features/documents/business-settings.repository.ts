import { prisma } from '../../lib/prisma';

export const BUSINESS_SETTINGS_ID = 'primary';

export class BusinessSettingsRepository {
  static find() {
    return prisma.businessSettings.findUnique({ where: { id: BUSINESS_SETTINGS_ID } });
  }

  static save(data: {
    shopName: string | null;
    address: string | null;
    phone: string | null;
    taxNumber: string | null;
    logoUrl: string | null;
    email: string | null;
    returnWindowDays?: number;
    updatedById: string;
  }) {
    return prisma.businessSettings.upsert({
      where: { id: BUSINESS_SETTINGS_ID },
      create: { id: BUSINESS_SETTINGS_ID, ...data },
      update: data,
    });
  }
}
