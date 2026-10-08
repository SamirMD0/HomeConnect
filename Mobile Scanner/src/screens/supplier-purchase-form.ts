import { PurchaseCurrency, PurchaseLineInput, PurchaseProduct } from '../api/supplier-purchases-api';

export interface PurchaseLineDraft {
  key: string;
  kind: 'EXISTING_PRODUCT' | 'MANUAL';
  product: PurchaseProduct | null;
  quantity: string;
  unitPrice: string;
  description: string;
  amount: string;
  priceIncludesVat: boolean;
}

export function newPurchaseLine(key: string): PurchaseLineDraft {
  return {
    key, kind: 'EXISTING_PRODUCT', product: null, quantity: '1', unitPrice: '',
    description: '', amount: '', priceIncludesVat: false,
  };
}

export function moneyMinorUnits(value: string, currency: PurchaseCurrency): number | null {
  if (!/^(?:0|[1-9]\d*)(?:\.\d{1,2})?$/.test(value)) return null;
  const [whole, fraction = ''] = value.split('.');
  if (currency === 'LBP' && Number(fraction) !== 0) return null;
  const units = currency === 'USD' ? Number(whole) * 100 + Number(fraction.padEnd(2, '0')) : Number(whole);
  return Number.isSafeInteger(units) ? units : null;
}

export function moneyText(units: number, currency: PurchaseCurrency): string {
  return currency === 'USD' ? (units / 100).toFixed(2) : String(units);
}

export function lineSubtotal(line: PurchaseLineDraft, currency: PurchaseCurrency): number | null {
  const amount = moneyMinorUnits(line.kind === 'MANUAL' ? line.amount : line.unitPrice, currency);
  if (amount === null) return null;
  if (line.kind === 'MANUAL') return amount;
  const quantity = Number(line.quantity);
  if (!Number.isSafeInteger(quantity) || quantity < 1) return null;
  const subtotal = amount * quantity;
  return Number.isSafeInteger(subtotal) ? subtotal : null;
}

export function lineIssue(line: PurchaseLineDraft, currency: PurchaseCurrency, receiveStock: boolean): string | null {
  if (line.kind === 'MANUAL') {
    if (line.description.trim().length < 2) return 'Enter a description';
    if ((lineSubtotal(line, currency) ?? 0) <= 0) return 'Enter a positive amount';
    return null;
  }
  if (!line.product) return 'Choose a product';
  if ((line.product.priceCurrency ?? 'USD') !== currency) return 'Product currency does not match the invoice';
  if (receiveStock && (!line.product.trackStock || line.product.notInInventory)) {
    return 'This product cannot receive stock yet';
  }
  if (!Number.isSafeInteger(Number(line.quantity)) || Number(line.quantity) < 1 || Number(line.quantity) > 100_000) {
    return 'Enter a whole quantity above zero';
  }
  if (lineSubtotal(line, currency) === null) return 'Enter a valid unit price';
  return null;
}

export function today(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

export function validDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export function newKey(): string {
  const chunk = () => Math.floor(Math.random() * 0xffffffff).toString(16).padStart(8, '0');
  return `${chunk()}-${chunk()}-${chunk()}-${chunk()}`;
}

export function buildDescription(lines: PurchaseLineDraft[], receiptNumber: string): string {
  const labels = lines.map((line) => line.kind === 'MANUAL' ? line.description.trim() : line.product?.name ?? '').filter(Boolean);
  const items = labels.slice(0, 3).join(', ');
  const rest = labels.length > 3 ? ` +${labels.length - 3}` : '';
  const receipt = receiptNumber.trim() ? ` · #${receiptNumber.trim()}` : '';
  return `Purchase: ${items}${rest}${receipt}`.slice(0, 500);
}

export function issueForInvoice(
  lines: PurchaseLineDraft[], currency: PurchaseCurrency, receiveStock: boolean,
  transactionDate: string, dueDate: string, billedTotal: string,
): string | null {
  if (!validDate(transactionDate) || transactionDate > today()) return 'Enter a valid purchase date, no later than today';
  if (dueDate && !validDate(dueDate)) return 'Enter a valid due date';
  if (!lines.length) return 'Add at least one line';
  if (lines.length > 100) return 'An invoice can have at most 100 lines';
  const used = new Set<string>();
  for (const line of lines) {
    const issue = lineIssue(line, currency, receiveStock);
    if (issue) return issue;
    if (line.kind === 'EXISTING_PRODUCT' && line.product) {
      if (used.has(line.product.id)) return 'Combine duplicate product lines';
      used.add(line.product.id);
    }
  }
  if ((moneyMinorUnits(billedTotal, currency) ?? 0) <= 0) return 'Enter the positive total shown on the supplier invoice';
  return null;
}

export function toApiLine(line: PurchaseLineDraft, currency: PurchaseCurrency): PurchaseLineInput {
  if (line.kind === 'MANUAL') {
    return { kind: 'MANUAL', description: line.description.trim(),
      amount: moneyText(moneyMinorUnits(line.amount, currency)!, currency), priceIncludesVat: line.priceIncludesVat };
  }
  return { kind: 'EXISTING_PRODUCT', productId: line.product!.id, quantity: Number(line.quantity),
    unitPrice: moneyText(moneyMinorUnits(line.unitPrice, currency)!, currency), priceIncludesVat: line.priceIncludesVat };
}
