import { Prisma } from '@prisma/client';

/**
 * Shop-internal product barcodes.
 *
 * A product with no manufacturer barcode gets a 13-digit EAN-13 in GS1's
 * restricted-circulation range (prefixes 200–299 are reserved for in-store
 * use, so they never collide with a real retail barcode). The number is
 * `200` + a 9-digit sequence + the EAN-13 check digit, e.g. `2000000002887`.
 *
 * It is stored in the ordinary `barcode` column, so the scanner, uniqueness
 * and label printing treat it like any other barcode. EAN-13 is the most
 * compact symbology — always 95 modules — so it fits every label at the
 * scan-safe module size, and its digits print under the bars.
 */
export const INTERNAL_BARCODE_PREFIX = '200';
const SEQUENCE_DIGITS = 9;
const MAX_ATTEMPTS = 10;

export function ean13CheckDigit(first12: string): number {
  if (!/^\d{12}$/.test(first12)) throw new Error('EAN-13 check digit needs exactly 12 digits');
  const sum = [...first12].reduce((total, digit, index) => total + Number(digit) * (index % 2 === 0 ? 1 : 3), 0);
  return (10 - (sum % 10)) % 10;
}

export function formatInternalBarcode(sequence: bigint | number): string {
  const body = `${INTERNAL_BARCODE_PREFIX}${sequence.toString().padStart(SEQUENCE_DIGITS, '0')}`;
  if (body.length !== 12) throw new Error('Internal barcode sequence is exhausted');
  return `${body}${ean13CheckDigit(body)}`;
}

export function isInternalBarcode(value: string | null | undefined): boolean {
  return typeof value === 'string' && /^\d{13}$/.test(value) && value.startsWith(INTERNAL_BARCODE_PREFIX)
    && ean13CheckDigit(value.slice(0, 12)) === Number(value[12]);
}

/**
 * Draws the next unused internal barcode. A value someone typed in by hand
 * could already hold a future number, so taken values are skipped.
 */
export async function generateInternalBarcode(tx: Prisma.TransactionClient): Promise<string> {
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
    const rows = await tx.$queryRaw<Array<{ value: bigint }>>`
      SELECT nextval('product_internal_barcode_seq') AS value
    `;
    if (!rows[0]) throw new Error('Internal barcode sequence returned no value');
    const candidate = formatInternalBarcode(rows[0].value);
    const taken = await tx.product.findFirst({ where: { barcode: { equals: candidate, mode: 'insensitive' } }, select: { id: true } });
    if (!taken) return candidate;
  }
  throw new Error('Could not find a free internal barcode');
}
