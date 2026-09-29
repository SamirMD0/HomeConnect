import { Prisma } from '@prisma/client';
import { prisma } from '../../../lib/prisma';

export const LABEL_SECRET_SETTINGS_ID = '6d66215e-8224-4c1c-9cd6-70c8c2ffde00';

const settingsInclude = {
  defaultPricingPreset: true,
  defaultEncodingPreset: true,
} satisfies Prisma.LabelSecretSettingsInclude;

export class LabelSecretConfigRepository {
  static settings(tx?: Prisma.TransactionClient) {
    return (tx ?? prisma).labelSecretSettings.findUnique({ where: { id: LABEL_SECRET_SETTINGS_ID }, include: settingsInclude });
  }

  static allowedPresets(tx?: Prisma.TransactionClient) {
    return (tx ?? prisma).pricingPreset.findMany({
      where: { isLabelSecretAllowed: true, isActive: true, archivedAt: null },
      orderBy: [{ name: 'asc' }, { id: 'asc' }],
    });
  }

  static availablePresets(tx?: Prisma.TransactionClient) {
    return (tx ?? prisma).pricingPreset.findMany({
      where: { isActive: true, archivedAt: null },
      orderBy: [{ name: 'asc' }, { id: 'asc' }],
    });
  }

  static encodings(tx?: Prisma.TransactionClient) {
    return (tx ?? prisma).labelSecretEncodingPreset.findMany({ orderBy: [{ isActive: 'desc' }, { name: 'asc' }, { id: 'asc' }] });
  }

  static encoding(id: string, tx?: Prisma.TransactionClient) {
    return (tx ?? prisma).labelSecretEncodingPreset.findUnique({ where: { id } });
  }
}
