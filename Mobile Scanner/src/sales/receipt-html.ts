import type { BusinessSettings, PaymentReceipt } from '../api/sales-write-api';
import { formatBusinessDate, formatMoney } from '@shared/money-format';
export const escapeReceiptText = (value: unknown) =>
  String(value ?? '—').replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!
  );
/** Server receipt data only; no local balance/tax calculations or remote resources. */
export function paymentReceiptHtml(receipt: PaymentReceipt, business: BusinessSettings): string {
  const text = escapeReceiptText,
    money = (value: string, currency: 'USD' | 'LBP') => text(formatMoney(value, currency));
  const fact = (label: string, value: unknown) =>
    `<div class="fact"><span>${text(label)}</span><strong>${text(value)}</strong></div>`;
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Payment receipt ${text(receipt.id)}</title><style>@page{size:A4;margin:18mm}*{box-sizing:border-box}body{font:14px Arial,sans-serif;color:#1b2124;background:#fff;margin:0;line-height:1.5}h1{font-size:24px;color:#155aa3;margin:0 0 8px}h2{font-size:18px;margin:24px 0 8px}p{margin:4px 0;white-space:pre-wrap;overflow-wrap:anywhere}.fact{display:flex;justify-content:space-between;gap:24px;padding:7px 0;border-bottom:1px solid #d6dfe3}.fact strong{text-align:right;overflow-wrap:anywhere}table{width:100%;border-collapse:collapse;margin-top:12px}th,td{padding:10px;border-bottom:1px solid #d6dfe3;text-align:left;overflow-wrap:anywhere}th{background:#eef4fb}td:last-child,th:last-child{text-align:right;font-variant-numeric:tabular-nums}tr{break-inside:avoid}.void{padding:12px;border:2px solid #a32121;color:#a32121;font-weight:bold;font-size:24px}footer{margin-top:28px;color:#536572}</style></head><body>
  ${receipt.voidedAt ? `<div class="void">VOID</div>` : ''}<h1>${text(business.shopName || 'Home Connect')}</h1><p>${text(business.address)}</p><p>${text(business.phone)} · ${text(business.email)}</p><p>VAT: ${text(business.taxNumber)}</p>${receipt.showBranchLine && receipt.branch ? `<p>${text(receipt.branch.name)} · ${text(receipt.branch.address)} · ${text(receipt.branch.phone)}</p>` : ''}
  <h2>PAYMENT RECEIPT</h2>${fact('Receipt no.', receipt.id)}${fact('Payment date', formatBusinessDate(receipt.paymentDate))}${fact('Currency', receipt.currency)}${receipt.currency !== 'USD' || !/^1(?:\.0+)?$/.test(receipt.exchangeRate) ? fact('Exchange rate (LBP / USD)', receipt.exchangeRate) : ''}
  <h2>Customer</h2><p>${text(receipt.customer?.name ?? 'Walk-in customer')}</p><p>${text(receipt.customer?.phone)}</p><p>${text(receipt.customer?.address)}</p>
  ${fact('Amount received', formatMoney(receipt.totalAmount, receipt.currency))}${fact('Payment method', receipt.paymentMethod.replace(/_/g, ' '))}${fact('Reference', receipt.reference)}${fact('Received by', receipt.receivedBy.name)}${receipt.sourceSalesOrder ? fact('Source sale', receipt.sourceSalesOrder.orderNumber) : ''}
  <h2>Allocation</h2><table><thead><tr><th>Allocated to</th><th>Type</th><th>Allocated amount</th></tr></thead><tbody>${receipt.allocations.map((a) => `<tr><td>${text(a.description)}</td><td>${a.targetType === 'DEBT' ? 'Debt' : 'Installment'}</td><td>${money(a.paymentAmount, a.paymentCurrency)}</td></tr>`).join('')}</tbody></table>
  ${receipt.sourceSalesOrder && receipt.sourceSnapshot ? (['subtotalExVat', 'vatAmount', 'totalAmount', 'remainingAmount'] as const).map((key) => (typeof receipt.sourceSnapshot?.[key] === 'string' ? fact({ subtotalExVat: 'Sale subtotal before VAT', vatAmount: 'Sale VAT', totalAmount: 'Sale total including VAT', remainingAmount: 'Sale remaining' }[key], formatMoney(receipt.sourceSnapshot[key] as string, receipt.currency)) : '')).join('') : ''}
  <h2>Remaining balance after payment</h2>${receipt.remainingBalances.map((b) => fact(b.description, formatMoney(b.amount, b.currency))).join('')}
  ${receipt.notes ? `<h2>Notes</h2><p>${text(receipt.notes)}</p>` : ''}${receipt.voidedAt ? `<h2>Void information</h2>${fact('Reason', receipt.voidReason)}${fact('Date', formatBusinessDate(receipt.voidedAt.slice(0, 10)))}${fact('Voided by', receipt.voidedBy?.name)}` : ''}<footer>Payment received · ${text(business.shopName || 'Home Connect')}</footer></body></html>`;
}
