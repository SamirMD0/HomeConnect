import { BilingualLabel } from '../../../components/ui';
import { formatBusinessDate } from '../../customer-financial/utils/financial-format';
import type { SalesReturn } from '../../sales-orders/types/sales-orders.types';
import type { BusinessSettings } from '../types/document.types';
import { DocumentMoney } from './DocumentMoney';

const label = (en: string, ar: string) => ({ en, ar });
const disposition = {
  SELLABLE: 'Sellable / صالح للبيع',
  DAMAGED: 'Damaged / تالف',
  QUARANTINE: 'Quarantine / قيد الفحص',
} as const;
const method = {
  NONE: 'No payout — applied to balance / بدون دفع — حُسم من الرصيد',
  CASH_OUT: 'Cash refund / استرداد نقدي',
  STORE_CREDIT: 'Store credit / رصيد للعميل',
} as const;

export function SalesReturnDocument({ salesReturn, business }: { salesReturn: SalesReturn; business: BusinessSettings }) {
  const exchangeRelevant = salesReturn.currency !== 'USD' || !/^1(?:\.0+)?$/.test(salesReturn.exchangeRate);
  return <article className="document-page sales-return-document" aria-label={`Sales return ${salesReturn.returnNumber}`}>
    <header className="document-header">
      <div className="flex min-w-0 items-start gap-4">
        {business.logoUrl ? <img className="document-logo" src={business.logoUrl} alt="Business logo / شعار المتجر" /> : <div className="document-logo-placeholder">Logo<br /><span dir="rtl">الشعار</span></div>}
        <div className="min-w-0"><h1 className="user-text text-2xl font-black" dir="auto">{configured(business.shopName, 'Shop name', 'اسم المتجر')}</h1><p className="user-text-pre mt-1 text-sm" dir="auto">{configured(business.address, 'Address', 'العنوان')}</p><p className="mt-1 text-sm" dir="ltr">{configured(business.phone, 'Phone', 'الهاتف')}</p><p className="mt-1 text-sm" dir="ltr">VAT / الضريبة: {configured(business.taxNumber, 'Tax number', 'الرقم الضريبي')}</p></div>
      </div>
      <div className="text-right"><BilingualLabel label={label('SALES RETURN', 'مرتجع مبيعات')} className="text-xl font-black text-brand-800" /><Datum name={label('Return no.', 'رقم المرتجع')} value={salesReturn.returnNumber} /><Datum name={label('Original invoice', 'الفاتورة الأصلية')} value={salesReturn.salesOrder.orderNumber} /><Datum name={label('Sale date', 'تاريخ البيع')} value={formatBusinessDate(salesReturn.salesOrder.orderDate)} /><Datum name={label('Return date', 'تاريخ الإرجاع')} value={formatBusinessDate(salesReturn.returnDate)} /><Datum name={label('Currency', 'العملة')} value={salesReturn.currency} />{exchangeRelevant && <Datum name={label('Exchange rate', 'سعر الصرف')} value={salesReturn.exchangeRate} />}</div>
    </header>
    <section className="document-info-grid"><div><BilingualLabel compact label={label('Customer', 'الزبون')} className="document-section-label" /><p className="user-text mt-2 font-bold" dir="auto">{salesReturn.customer?.name ?? '[Walk-in customer / زبون نقدي]'}</p><p dir="ltr">{salesReturn.customer?.phone ?? '—'}</p></div><div><BilingualLabel compact label={label('Processed by', 'تمت المعالجة بواسطة')} className="document-section-label" /><p className="mt-2 font-bold">{salesReturn.processedByName}</p><p className="text-sm text-slate-500">@{salesReturn.processedByUsername}</p></div></section>
    <table className="document-table"><thead><tr><th><BilingualLabel compact label={label('Item', 'الصنف')} /></th><th><BilingualLabel compact label={label('Qty', 'الكمية')} /></th><th><BilingualLabel compact label={label('Original unit price', 'سعر الوحدة الأصلي')} /></th><th><BilingualLabel compact label={label('VAT', 'الضريبة')} /></th><th><BilingualLabel compact label={label('Total incl. VAT', 'الإجمالي شامل الضريبة')} /></th><th><BilingualLabel compact label={label('Disposition', 'حالة المخزون')} /></th></tr></thead><tbody>{salesReturn.items.map((item) => <tr key={item.id}><td><p className="user-text font-semibold" dir="auto">{item.productNameSnapshot}</p><p className="text-xs text-slate-500">{item.productModelSnapshot ?? item.skuSnapshot ?? ''}</p></td><td className="text-center">{item.quantity}</td><td className="text-right"><DocumentMoney field={`items.${item.id}.unitPriceSnapshot`} value={item.unitPriceSnapshot} currency={salesReturn.currency} /></td><td className="text-right"><span className="block text-xs">{item.taxRateSnapshot}%</span><DocumentMoney field={`items.${item.id}.vatAmount`} value={item.vatAmount} currency={salesReturn.currency} /></td><td className="text-right font-semibold"><DocumentMoney field={`items.${item.id}.totalIncVat`} value={item.totalIncVat} currency={salesReturn.currency} /></td><td>{disposition[item.stockDisposition]}</td></tr>)}</tbody></table>
    <div className="document-summary"><div><BilingualLabel compact label={label('Refund method', 'طريقة الاسترداد')} className="font-bold" /><p className="mt-2">{method[salesReturn.refundMethod]}</p>{salesReturn.deliveryReturned && <p className="mt-2 text-sm">Delivery returned / تم إرجاع التوصيل · {salesReturn.deliveryTaxTreatment} · {salesReturn.deliveryTaxRateSnapshot}%</p>}</div><dl className="document-totals"><Money name={label('Subtotal before VAT', 'المجموع قبل الضريبة')} field="subtotalExVat" value={salesReturn.subtotalExVat} data={salesReturn} /><Money name={label('VAT', 'الضريبة')} field="vatAmount" value={salesReturn.vatAmount} data={salesReturn} /><Money name={label('Return total', 'إجمالي المرتجع')} field="totalIncVat" value={salesReturn.totalIncVat} data={salesReturn} strong /><Money name={label('Applied to outstanding', 'المحسوم من الرصيد')} field="receivableReliefAmount" value={salesReturn.receivableReliefAmount} data={salesReturn} /><Money name={label('Refundable', 'القابل للاسترداد')} field="refundableAmount" value={salesReturn.refundableAmount} data={salesReturn} strong /></dl></div>
    <section className="document-notes"><BilingualLabel compact label={label('Reason', 'السبب')} className="font-bold" /><p className="user-text-pre mt-2" dir="auto">{salesReturn.reason}</p></section>
    <footer className="document-footer">This document reverses part or all of the original sale without altering the original invoice.<br /><span dir="rtl">يعكس هذا المستند جزءاً من البيع الأصلي أو كله دون تعديل الفاتورة الأصلية.</span></footer>
  </article>;
}

function configured(value: string | null, en: string, ar: string) { return value || `[${en} not configured / ${ar} غير مضبوط]`; }
function Datum({ name, value }: { name: { en: string; ar: string }; value: string }) { return <div className="mt-2"><BilingualLabel compact label={name} className="justify-end text-xs font-semibold text-slate-500" /><p className="font-semibold" dir="ltr">{value}</p></div>; }
function Money({ name, field, value, data, strong = false }: { name: { en: string; ar: string }; field: string; value: string; data: SalesReturn; strong?: boolean }) { return <div className={strong ? 'document-total-strong' : ''}><dt><BilingualLabel compact label={name} /></dt><dd><DocumentMoney field={field} value={value} currency={data.currency} /></dd></div>; }
