import { canonicalMoneyInput, centsToMoney, moneyToCents } from '../../customer-financial/utils/money-input';
import type { PurchaseLineMode, SupplierPurchaseLineInput } from '../types/supplier-purchase.types';

export interface PurchaseLineDraft {
  /** Local list key only — never sent to the server. */
  key: string;
  mode: PurchaseLineMode;
  productId: string | null;
  /** Name alone, for the generated description. `productLabel` carries the SKU too. */
  productName: string;
  productLabel: string;
  productStock: number | null;
  /** Last recorded cost for the selected product, shown as a suggestion. */
  lastCost: string | null;
  newName: string;
  newModel: string;
  newBarcode: string;
  newBrand: string;
  newSellingPrice: string;
  quantity: string;
  unitPrice: string;
  description: string;
  amount: string;
}

let sequence = 0;
export const emptyLine = (mode: PurchaseLineMode = 'EXISTING_PRODUCT'): PurchaseLineDraft => ({
  key: `line-${(sequence += 1)}`,
  mode,
  productId: null, productName: '', productLabel: '', productStock: null, lastCost: null,
  newName: '', newModel: '', newBarcode: '', newBrand: '', newSellingPrice: '',
  quantity: '1', unitPrice: '', description: '', amount: '',
});

/** Clears the fields that belong to the mode being left, so a switch cannot smuggle stale values through. */
export const withMode = (line: PurchaseLineDraft, mode: PurchaseLineMode): PurchaseLineDraft => ({
  ...emptyLine(mode), key: line.key, quantity: line.quantity,
});

const quantityOf = (line: PurchaseLineDraft): number => {
  const parsed = Number.parseInt(line.quantity, 10);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : 0;
};

/**
 * Exact cent arithmetic — the same total the server will recompute. Returns null
 * while a line is still incomplete so the UI can show a dash instead of a wrong
 * number.
 */
export function lineTotal(line: PurchaseLineDraft): string | null {
  if (line.mode === 'MANUAL') {
    const cents = moneyToCents(line.amount);
    return cents > 0n ? centsToMoney(cents) : null;
  }
  const unitCents = moneyToCents(line.unitPrice);
  const quantity = quantityOf(line);
  if (unitCents < 0n || quantity === 0) return null;
  return centsToMoney(unitCents * BigInt(quantity));
}

export function purchaseTotal(lines: PurchaseLineDraft[]): string {
  return centsToMoney(lines.reduce((total, line) => {
    const value = lineTotal(line);
    return value === null ? total : total + moneyToCents(value);
  }, 0n));
}

export const hasQuickAdd = (lines: PurchaseLineDraft[]): boolean => lines.some((line) => line.mode === 'NEW_PRODUCT');

/**
 * Why a line cannot be submitted yet, or null when it is ready. Mirrors the
 * server schema so the user is told at the field rather than by a failed save.
 */
export function lineProblem(line: PurchaseLineDraft): string | null {
  if (line.mode === 'MANUAL') {
    if (!line.description.trim()) return 'Description is required / الوصف مطلوب';
    return moneyToCents(line.amount) > 0n ? null : 'Amount must be greater than zero / يجب أن يكون المبلغ أكبر من صفر';
  }
  if (line.mode === 'EXISTING_PRODUCT' && !line.productId) return 'Select a product / اختر منتجًا';
  if (line.mode === 'NEW_PRODUCT') {
    if (!line.newName.trim()) return 'Product name is required / اسم المنتج مطلوب';
    if (!line.newModel.trim()) return 'Model is required / الموديل مطلوب';
  }
  if (quantityOf(line) === 0) return 'Quantity must be a whole number above zero / يجب أن تكون الكمية عددًا صحيحًا أكبر من صفر';
  return moneyToCents(line.unitPrice) >= 0n ? null : 'Enter a unit price / أدخل سعر الوحدة';
}

/** The same product twice would collide with the one-row-per-product receiving rule. */
export function duplicateProductIds(lines: PurchaseLineDraft[]): Set<string> {
  const seen = new Set<string>();
  const duplicates = new Set<string>();
  for (const line of lines) {
    if (line.mode !== 'EXISTING_PRODUCT' || !line.productId) continue;
    if (seen.has(line.productId)) duplicates.add(line.productId);
    seen.add(line.productId);
  }
  return duplicates;
}

/** How many line labels appear before the rest are summarised as a count. */
const DESCRIPTION_LABEL_LIMIT = 3;

const lineLabel = (line: PurchaseLineDraft): string => {
  if (line.mode === 'MANUAL') return line.description.trim();
  const name = (line.mode === 'NEW_PRODUCT' ? line.newName : line.productName).trim();
  if (!name) return '';
  const quantity = Number.parseInt(line.quantity, 10);
  return Number.isSafeInteger(quantity) && quantity > 1 ? `${name} × ${quantity}` : name;
};

/** The server caps a description at 500 characters. */
const DESCRIPTION_LIMIT = 500;
/**
 * How much of the limit the item list may take. The list appears in both the
 * English and the Arabic half, so its budget is roughly a third of the whole,
 * leaving room for the sentence around it.
 */
const ITEMS_BUDGET = 170;

const truncate = (value: string, limit: number) => value.length <= limit ? value : `${value.slice(0, limit - 1).trimEnd()}…`;

/** "and 2 more", with Arabic's singular, dual, and plural forms handled properly. */
const moreEnglish = (count: number) => `and ${count} more`;
const moreArabic = (count: number) =>
  count === 1 ? 'وبند آخر' : count === 2 ? 'وبندان آخران' : `و${count} بنود أخرى`;

/**
 * Builds the ledger description from what was actually bought, so the common
 * case needs no typing: what, for how much, against which receipt.
 *
 * Written as a bilingual sentence rather than a joined code string, because
 * this text is what the owner reads back months later in the supplier ledger,
 * the audit trail, and a receipt search.
 *
 * The two languages go on separate lines rather than sharing one with a slash:
 * a product name is often Latin text inside an Arabic sentence, and running
 * both halves together makes the bidirectional layout reorder them into
 * something genuinely hard to read. A line break gives each half its own
 * direction. Newlines are valid here — the server's text validator rejects
 * control characters but allows them.
 *
 * Returns an empty string while nothing is filled in yet, which leaves the
 * form's own "add a line" blocker in charge rather than posting a meaningless
 * description.
 */
export function suggestedPurchaseDescription(
  lines: PurchaseLineDraft[],
  receiptNumber: string,
  total: string
): string {
  const labels = lines.map(lineLabel).filter(Boolean);
  if (!labels.length) return '';

  const shown = labels.slice(0, DESCRIPTION_LABEL_LIMIT);
  const remaining = labels.length - shown.length;
  const english = truncate([shown.join(', '), ...(remaining ? [moreEnglish(remaining)] : [])].join(' '), ITEMS_BUDGET);
  const arabic = truncate([shown.join('، '), ...(remaining ? [moreArabic(remaining)] : [])].join(' '), ITEMS_BUDGET);

  const receipt = receiptNumber.trim();
  const priced = moneyToCents(total) > 0n;

  const sentence = [
    `Purchased ${english}`,
    ...(priced ? [`for ${total}`] : []),
    ...(receipt ? [`on invoice ${receipt}`] : []),
  ].join(' ');
  const jumla = [
    `تم شراء ${arabic}`,
    ...(priced ? [`بمبلغ ${total}`] : []),
    ...(receipt ? [`بموجب الفاتورة ${receipt}`] : []),
  ].join(' ');

  return `${sentence}\n${jumla}`.slice(0, DESCRIPTION_LIMIT);
}

export function toApiLines(lines: PurchaseLineDraft[]): SupplierPurchaseLineInput[] {
  return lines.map((line) => {
    if (line.mode === 'MANUAL') {
      return { kind: 'MANUAL' as const, description: line.description.trim(), amount: canonicalMoneyInput(line.amount) };
    }
    const shared = { quantity: Number.parseInt(line.quantity, 10), unitPrice: canonicalMoneyInput(line.unitPrice) };
    if (line.mode === 'NEW_PRODUCT') {
      return {
        kind: 'NEW_PRODUCT' as const,
        name: line.newName.trim(), model: line.newModel.trim(),
        barcode: line.newBarcode.trim() || null,
        brand: line.newBrand.trim() || null,
        sellingPrice: line.newSellingPrice.trim() ? canonicalMoneyInput(line.newSellingPrice) : null,
        ...shared,
      };
    }
    return { kind: 'EXISTING_PRODUCT' as const, productId: line.productId!, ...shared };
  });
}
