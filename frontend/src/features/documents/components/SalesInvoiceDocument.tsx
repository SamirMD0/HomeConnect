import { BilingualLabel } from '../../../components/ui';
import { formatBusinessDate } from '../../customer-financial/utils/financial-format';
import type { SalesOrder, SalesOrderPaymentStatus } from '../../sales-orders/types/sales-orders.types';
import type { BusinessSettings } from '../types/document.types';
import { DocumentMoney } from './DocumentMoney';

const labels = {
  invoice: { en: 'SALES INVOICE', ar: 'فاتورة مبيعات' },
  invoiceNumber: { en: 'Invoice no.', ar: 'رقم الفاتورة' },
  date: { en: 'Date', ar: 'التاريخ' },
  currency: { en: 'Currency', ar: 'العملة' },
  exchangeRate: { en: 'Exchange rate', ar: 'سعر الصرف' },
  customer: { en: 'Customer', ar: 'الزبون' },
  phone: { en: 'Phone', ar: 'الهاتف' },
  address: { en: 'Address', ar: 'العنوان' },
  paymentStatus: { en: 'Payment status', ar: 'حالة الدفع' },
  item: { en: 'Item', ar: 'الصنف' },
  quantity: { en: 'Qty', ar: 'الكمية' },
  unitPrice: { en: 'Unit price', ar: 'سعر الوحدة' },
  vatRate: { en: 'VAT rate', ar: 'نسبة الضريبة' },
  vatAmount: { en: 'VAT', ar: 'الضريبة' },
  lineTotal: { en: 'Line total incl. VAT', ar: 'الإجمالي شامل الضريبة' },
  itemsSubtotal: { en: 'Items subtotal before VAT', ar: 'مجموع الأصناف قبل الضريبة' },
  deliveryBeforeVat: { en: 'Delivery before VAT', ar: 'التوصيل قبل الضريبة' },
  deliveryVat: { en: 'Delivery VAT', ar: 'ضريبة التوصيل' },
  subtotalBeforeVat: { en: 'Subtotal before VAT', ar: 'المجموع قبل الضريبة' },
  totalVat: { en: 'Total VAT', ar: 'إجمالي الضريبة' },
  total: { en: 'Total incl. VAT', ar: 'الإجمالي شامل الضريبة' },
  paid: { en: 'Paid', ar: 'المدفوع' },
  remaining: { en: 'Remaining', ar: 'المتبقي' },
  dueDate: { en: 'Debt due date', ar: 'تاريخ استحقاق الدين' },
  notes: { en: 'Notes', ar: 'ملاحظات' },
} as const;

const paymentLabels: Record<SalesOrderPaymentStatus, { en: string; ar: string }> = {
  UNPAID: { en: 'Unpaid', ar: 'غير مدفوع' },
  PARTIALLY_PAID: { en: 'Partially paid', ar: 'مدفوع جزئياً' },
  PAID: { en: 'Paid', ar: 'مدفوع' },
};

const deliveryTreatmentLabels = {
  STANDARD: 'Standard-rated / خاضع للنسبة القياسية',
  ZERO_RATED: 'Zero-rated / خاضع لنسبة صفر',
  EXEMPT: 'Exempt / معفى',
} as const;

export function invoiceTotalsFromOrder(order: SalesOrder) {
  return {
    itemsSubtotal: order.itemsSubtotal,
    deliveryFeeExVat: order.deliveryFeeExVat,
    deliveryVatAmount: order.deliveryVatAmount,
    subtotalExVat: order.subtotalExVat,
    vatAmount: order.vatAmount,
    totalAmount: order.totalAmount,
    paidAmount: order.paidAmount,
    remainingAmount: order.remainingAmount,
  };
}

export function SalesInvoiceDocument({ order, business }: { order: SalesOrder; business: BusinessSettings }) {
  const totals = invoiceTotalsFromOrder(order);
  const exchangeRateIsRelevant = order.currency !== 'USD' || !/^1(?:\.0+)?$/.test(order.exchangeRate);
  const dueDate = order.debt?.dueDate ?? null;

  return (
    <article className="document-page sales-invoice" aria-label={`Invoice ${order.orderNumber}`}>
      {['PARTIALLY_RETURNED', 'CANCELLED', 'RETURNED'].includes(order.fulfillmentStatus) && (
        <div className="document-watermark">{order.fulfillmentStatus.replaceAll('_', ' ')} / {order.fulfillmentStatus === 'CANCELLED' ? 'ملغاة' : order.fulfillmentStatus === 'PARTIALLY_RETURNED' ? 'مرتجعة جزئياً' : 'مرتجعة'}</div>
      )}
      <header className="document-header">
        <div className="flex min-w-0 items-start gap-4">
          {business.logoUrl
            ? <img className="document-logo" src={business.logoUrl} alt="Business logo / شعار المتجر" />
            : <div className="document-logo-placeholder">Logo<br /><span dir="rtl">الشعار</span></div>}
          <div className="min-w-0">
            <h1 className="user-text text-2xl font-black text-slate-950" dir="auto">{configured(business.shopName, 'Shop name', 'اسم المتجر')}</h1>
            <p className="user-text-pre mt-1 text-sm text-slate-700" dir="auto">{configured(business.address, 'Address', 'العنوان')}</p>
            <p className="mt-1 text-sm" dir="ltr">{configured(business.phone, 'Phone', 'الهاتف')}</p>
            <p className="mt-1 text-sm" dir="ltr">{configured(business.email, 'Email', 'البريد الإلكتروني')}</p>
            <p className="mt-1 text-sm font-semibold" dir="ltr">VAT / الضريبة: {configured(business.taxNumber, 'Tax number', 'الرقم الضريبي')}</p>
          </div>
        </div>
        <div className="text-right">
          <BilingualLabel label={labels.invoice} className="text-xl font-black text-brand-800" />
          <DocumentDatum label={labels.invoiceNumber} value={order.orderNumber} ltr />
          <DocumentDatum label={labels.date} value={formatBusinessDate(order.orderDate)} ltr />
          <DocumentDatum label={labels.currency} value={order.currency} ltr />
          {exchangeRateIsRelevant && <DocumentDatum label={labels.exchangeRate} value={`${order.exchangeRate} LBP / USD`} ltr />}
        </div>
      </header>

      <section className="document-info-grid">
        <div>
          <BilingualLabel compact label={labels.customer} className="document-section-label" />
          <p className="user-text mt-2 font-bold" dir="auto">{order.customer?.name ?? '[Walk-in customer / زبون نقدي]'}</p>
          <p className="mt-1 text-sm" dir="ltr">{order.customer?.phone ?? '[Phone not available / الهاتف غير متوفر]'}</p>
          <p className="user-text-pre mt-1 text-sm" dir="auto">{order.deliveryAddressSnapshot ?? order.customer?.address ?? '[Address not available / العنوان غير متوفر]'}</p>
        </div>
        <dl className="document-facts">
          <Fact label={labels.paymentStatus}><BilingualLabel compact label={paymentLabels[order.paymentStatus]} /></Fact>
          {dueDate && <Fact label={labels.dueDate}><span dir="ltr">{formatBusinessDate(dueDate)}</span></Fact>}
        </dl>
      </section>

      <table className="document-table">
        <thead><tr>
          <th><BilingualLabel compact label={labels.item} /></th>
          <th className="text-center"><BilingualLabel compact label={labels.quantity} /></th>
          <th className="text-right"><BilingualLabel compact label={labels.unitPrice} /></th>
          <th className="text-center"><BilingualLabel compact label={labels.vatRate} /></th>
          <th className="text-right"><BilingualLabel compact label={labels.vatAmount} /></th>
          <th className="text-right"><BilingualLabel compact label={labels.lineTotal} /></th>
        </tr></thead>
        <tbody>
          {order.items.map((item) => (
            <tr key={item.id}>
              <td><p className="user-text font-semibold" dir="auto">{item.productNameSnapshot}</p>{(item.productModelSnapshot || item.skuSnapshot) && <p className="user-text text-xs text-slate-500" dir="auto">{item.productModelSnapshot ?? item.skuSnapshot}</p>}</td>
              <td className="text-center tabular-nums" dir="ltr">{item.quantity}</td>
              <td className="text-right"><DocumentMoney field={`items.${item.id}.unitPrice`} value={item.unitPrice} currency={order.currency} /></td>
              <td className="text-center tabular-nums" dir="ltr">{item.taxRateSnapshot}%</td>
              <td className="text-right"><DocumentMoney field={`items.${item.id}.vatAmount`} value={item.vatAmount} currency={order.currency} /></td>
              <td className="text-right font-semibold"><DocumentMoney field={`items.${item.id}.lineTotalIncVat`} value={item.lineTotalIncVat} currency={order.currency} /></td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="document-summary">
        <div className="text-sm text-slate-600">
          <p><strong>Delivery VAT / ضريبة التوصيل:</strong> {deliveryTreatmentLabels[order.deliveryTaxTreatment]}</p>
          <p className="mt-1" dir="ltr">{order.deliveryTaxCodeSnapshot ?? '—'} · {order.deliveryTaxRateSnapshot}%</p>
        </div>
        <dl className="document-totals">
          <MoneyFact label={labels.itemsSubtotal} field="itemsSubtotal" value={totals.itemsSubtotal} order={order} />
          <MoneyFact label={labels.deliveryBeforeVat} field="deliveryFeeExVat" value={totals.deliveryFeeExVat} order={order} />
          <MoneyFact label={labels.deliveryVat} field="deliveryVatAmount" value={totals.deliveryVatAmount} order={order} />
          <MoneyFact label={labels.subtotalBeforeVat} field="subtotalExVat" value={totals.subtotalExVat} order={order} />
          <MoneyFact label={labels.totalVat} field="vatAmount" value={totals.vatAmount} order={order} />
          <MoneyFact strong label={labels.total} field="totalAmount" value={totals.totalAmount} order={order} />
          <MoneyFact label={labels.paid} field="paidAmount" value={totals.paidAmount} order={order} />
          <MoneyFact strong label={labels.remaining} field="remainingAmount" value={totals.remainingAmount} order={order} />
        </dl>
      </div>

      {(order.notes || order.deliveryNotes) && <section className="document-notes"><BilingualLabel compact label={labels.notes} className="font-bold" />{order.notes && <p className="user-text-pre mt-2" dir="auto">{order.notes}</p>}{order.deliveryNotes && <p className="user-text-pre mt-2" dir="auto">{order.deliveryNotes}</p>}</section>}
      <footer className="document-footer">Thank you / شكراً لكم</footer>
    </article>
  );
}

function configured(value: string | null, en: string, ar: string) {
  return value || `[${en} not configured / ${ar} غير مضبوط]`;
}

function DocumentDatum({ label, value, ltr = false }: { label: { en: string; ar: string }; value: string; ltr?: boolean }) {
  return <div className="mt-2"><BilingualLabel compact label={label} className="justify-end text-xs font-semibold text-slate-500" /><p className="font-semibold" dir={ltr ? 'ltr' : 'auto'}>{value}</p></div>;
}

function Fact({ label, children }: { label: { en: string; ar: string }; children: React.ReactNode }) {
  return <div><dt><BilingualLabel compact label={label} className="text-xs font-semibold text-slate-500" /></dt><dd className="mt-1 font-semibold">{children}</dd></div>;
}

function MoneyFact({ label, field, value, order, strong = false }: { label: { en: string; ar: string }; field: string; value: string; order: SalesOrder; strong?: boolean }) {
  return <div className={strong ? 'document-total-strong' : ''}><dt><BilingualLabel compact label={label} /></dt><dd><DocumentMoney field={field} value={value} currency={order.currency} /></dd></div>;
}
