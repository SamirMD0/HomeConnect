import { Role } from '@prisma/client';
import { AuthorizationError } from '../../../lib/errors';
import { requireRole } from '../../../middleware/role.middleware';

export const requirePricingAdmin = requireRole([Role.ADMIN]);

export const PRICING_PRESET_SENSITIVE_FIELDS = [
  'expensePercent', 'profitPercent', 'discountBufferPercent',
  'installmentMarkupPercent', 'downPaymentPercent',
  'defaultInstallmentMonths', 'calculationMode', 'roundingMode',
] as const;

export function containsSensitivePricingPresetFields(fields: string[]): boolean {
  return fields.some((field) => (PRICING_PRESET_SENSITIVE_FIELDS as readonly string[]).includes(field));
}

export function assertPricingAdmin(user: { role: string } | undefined): void {
  if (!user || user.role !== Role.ADMIN) {
    throw new AuthorizationError('Only administrators can change pricing presets');
  }
}
