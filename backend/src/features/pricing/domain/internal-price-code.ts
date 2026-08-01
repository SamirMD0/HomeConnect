import { Decimal } from '@prisma/client/runtime/library';

export const INTERNAL_PRICE_CODE_PREFIX = 'P';

/** A staff memory aid only. It is derived, non-unique, and never an identifier. */
export function formatInternalPriceCode(value: Decimal): string | null {
  if (value.lessThanOrEqualTo(0)) return null;
  return `${INTERNAL_PRICE_CODE_PREFIX}${value.toDecimalPlaces(0, Decimal.ROUND_HALF_UP).toFixed(0)}`;
}

/** Display-only employee aid. The canonical SKU and barcode remain unchanged. */
export function formatStaffLabelCode(sku: string, internalPriceCode: string): string {
  return `${sku}-K${internalPriceCode.replace(/^[A-Z]+/, '')}Z`;
}
