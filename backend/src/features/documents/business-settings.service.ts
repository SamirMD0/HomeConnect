import { BusinessSettingsRepository } from './business-settings.repository';
import type { UpdateBusinessSettingsInput } from './business-settings.validator';

const EMPTY_SETTINGS = {
  id: 'primary',
  shopName: null,
  address: null,
  phone: null,
  taxNumber: null,
  logoUrl: null,
  email: null,
  returnWindowDays: 14,
  updatedAt: null,
} as const;

export class BusinessSettingsService {
  static async get() {
    const settings = await BusinessSettingsRepository.find();
    return settings ? serialize(settings) : EMPTY_SETTINGS;
  }

  static async update(input: UpdateBusinessSettingsInput, userId: string) {
    return serialize(await BusinessSettingsRepository.save({ ...input, updatedById: userId }));
  }
}

function serialize(settings: Awaited<ReturnType<typeof BusinessSettingsRepository.find>> & {}) {
  return {
    id: settings.id,
    shopName: settings.shopName,
    address: settings.address,
    phone: settings.phone,
    taxNumber: settings.taxNumber,
    logoUrl: settings.logoUrl,
    email: settings.email,
    returnWindowDays: settings.returnWindowDays,
    updatedAt: settings.updatedAt.toISOString(),
  };
}
