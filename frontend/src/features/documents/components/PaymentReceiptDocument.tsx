import { BilingualLabel } from '../../../components/ui';
import { formatBusinessDate } from '../../customer-financial/utils/financial-format';
import { paymentMethodLabels } from '../../customer-financial/utils/financial-labels';
import type { BusinessSettings, PaymentReceipt } from '../types/document.types';
import { DocumentMoney } from './DocumentMoney';

const labels = {
  receipt: { en: 'PAYMENT RECEIPT', ar: 'إيصال دفع' },
  receiptNumber: { en: 'Receipt no.', ar: 'رقم الإيصال' },
  date: { en: 'Date', ar: 'التاريخ' },
  currency: { en: 'Currency', ar: 'العملة' },
  exchangeRate: { en: 'Exchange rate', ar: 'سعر الصرف' },
  customer: { en: 'Customer', ar: 'الزبون' },
  phone: { en: 'Phone', ar: 'الهاتف' },
  address: { en: 'Address', ar: 'العنوان' },
  amountReceived: { en: 'Amount received', ar: 'المبلغ المقبوض' },
  paymentMethod: { en: 'Payment method', ar: 'طريقة الدفع' },
  reference: { en: 'Reference', ar: 'المرجع' },
  receivedBy: { en: 'Received by', ar: 'استلمها' },
  allocatedTo: { en: 'Allocated to', ar: 'مخصص إلى' },
  allocationType: { en: 'Type', ar: 'النوع' },
  allocationAmount: { en: 'Allocated amount', ar: 'المبلغ المخصص' },
  remaining: { en: 'Remaining balance after payment', ar: 'الرصيد المتبقي بعد الدفع' },
  voidReason: { en: 'Void reason', ar: 'سبب الإلغاء' },
  voidDate: { en: 'Void date', ar: 'تاريخ الإلغاء' },
  voidedBy: { en: 'Voided by', ar: 'ألغيت بواسطة' },
  notes: { en: 'Notes', ar: 'ملاحظات' },
} as const;

export function PaymentReceiptDocument({ receipt, business }: { receipt: PaymentReceipt; business: BusinessSettings }) {
  const exchangeRateIsRelevant = receipt.currency !== 'USD' || !/^1(?:\.0+)?$/.test(receipt.exchangeRate);

  return (
    <article className="document-page payment-receipt" aria-label={`Payment receipt ${receipt.id}`}>
      {receipt.voidedAt && <div className="document-watermark receipt-void-watermark">VOID / ملغاة</div>}
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
          <BilingualLabel label={labels.receipt} className="text-xl font-black text-brand-800" />
          <DocumentDatum label={labels.receiptNumber} value={receipt.id} ltr />
          <DocumentDatum label={labels.date} value={formatBusinessDate(receipt.paymentDate)} ltr />
          <DocumentDatum label={labels.currency} value={receipt.currency} ltr />
          {exchangeRateIsRelevant && <DocumentDatum label={labels.exchangeRate} value={`${receipt.exchangeRate} LBP / USD`} ltr />}
        </div>
      </header>

      <section className="document-info-grid">
        <div>
          <BilingualLabel compact label={labels.customer} className="document-section-label" />
          <p className="user-text mt-2 font-bold" dir="auto">{receipt.customer.name}</p>
          <p className="mt-1 text-sm" dir="ltr">{receipt.customer.phone}</p>
          <p className="user-text-pre mt-1 text-sm" dir="auto">{receipt.customer.address ?? '[Address not available / العنوان غير متوفر]'}</p>
        </div>
        <dl className="document-facts">
          <Fact label={labels.amountReceived}><DocumentMoney field="totalAmount" value={receipt.totalAmount} currency={receipt.currency} /></Fact>
          <Fact label={labels.paymentMethod}><span>{paymentMethodLabels[receipt.paymentMethod]}</span></Fact>
          {receipt.reference && <Fact label={labels.reference}><span className="user-text" dir="auto">{receipt.reference}</span></Fact>}
          <Fact label={labels.receivedBy}><span className="user-text" dir="auto">{receipt.receivedBy.name}</span></Fact>
        </dl>
      </section>

      <table className="document-table">
        <thead><tr>
          <th><BilingualLabel compact label={labels.allocatedTo} /></th>
          <th><BilingualLabel compact label={labels.allocationType} /></th>
          <th className="text-right"><BilingualLabel compact label={labels.allocationAmount} /></th>
        </tr></thead>
        <tbody>{receipt.allocations.map((allocation) => (
          <tr key={allocation.id}>
            <td className="user-text" dir="auto">{allocation.description}</td>
            <td>{allocation.targetType === 'DEBT' ? 'Debt / دين' : 'Installment / قسط'}</td>
            <td className="text-right"><DocumentMoney field={`allocations.${allocation.id}.paymentAmount`} value={allocation.paymentAmount} currency={allocation.paymentCurrency} /></td>
          </tr>
        ))}</tbody>
      </table>

      <div className="document-summary">
        <div />
        <dl className="document-totals">
          {receipt.remainingBalances.map((balance) => (
            <div className="document-total-strong" key={`${balance.obligationType}-${balance.obligationId}`}>
              <dt><BilingualLabel compact label={labels.remaining} /><p className="user-text mt-1 text-xs font-normal text-slate-500" dir="auto">{balance.description}</p></dt>
              <dd><DocumentMoney field={`remainingBalances.${balance.obligationId}`} value={balance.amount} currency={balance.currency} /></dd>
            </div>
          ))}
        </dl>
      </div>

      {receipt.voidedAt && (
        <section className="receipt-void-metadata" aria-label="Void metadata / بيانات الإلغاء">
          <VoidFact label={labels.voidReason} value={receipt.voidReason ?? '[Reason not recorded / السبب غير مسجل]'} />
          <VoidFact label={labels.voidDate} value={formatBusinessDate(receipt.voidedAt.slice(0, 10))} ltr />
          <VoidFact label={labels.voidedBy} value={receipt.voidedBy?.name ?? '[Actor not available / المستخدم غير متوفر]'} />
        </section>
      )}
      {receipt.notes && <section className="document-notes"><BilingualLabel compact label={labels.notes} className="font-bold" /><p className="user-text-pre mt-2" dir="auto">{receipt.notes}</p></section>}
      <footer className="document-footer">Payment received / تم استلام الدفعة</footer>
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

function VoidFact({ label, value, ltr = false }: { label: { en: string; ar: string }; value: string; ltr?: boolean }) {
  return <div><BilingualLabel compact label={label} className="text-xs font-bold text-red-800" /><p className="user-text mt-1 font-semibold" dir={ltr ? 'ltr' : 'auto'}>{value}</p></div>;
}
