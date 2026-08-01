import { Prisma } from '@prisma/client';

export const PRODUCT_SKU_PREFIX = 'HC-';
export const PRODUCT_SKU_PATTERN = /^[A-Z0-9-]{4,32}$/;

export function formatProductSku(sequence: bigint | number): string {
  return `${PRODUCT_SKU_PREFIX}${sequence.toString().padStart(6, '0')}`;
}

export async function generateProductSku(tx: Prisma.TransactionClient): Promise<string> {
  const rows = await tx.$queryRaw<Array<{ value: bigint }>>`
    SELECT nextval('product_sku_seq') AS value
  `;
  if (!rows[0]) throw new Error('Product SKU sequence returned no value');
  return formatProductSku(rows[0].value);
}
