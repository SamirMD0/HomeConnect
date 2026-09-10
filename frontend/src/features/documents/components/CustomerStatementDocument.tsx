import { BilingualLabel } from '../../../components/ui';
import { formatBusinessDate } from '../../customer-financial/utils/financial-format';
import type { BusinessSettings, CustomerStatement, CustomerStatementEntryStatus } from '../types/document.types';
import { DocumentMoney } from './DocumentMoney';

const labels = {
  statement: { en: 'CUSTOMER STATEMENT', ar: 'كشف حساب زبون' },
  period: { en: 'Statement period', ar: 'فترة كشف الحساب' },
  customer: { en: 'Customer', ar: 'الزبون' },
  phone: { en: 'Phone', ar: 'الهاتف' },
  address: { en: 'Address', ar: 'العنوان' },
  currency: { en: 'Reporting currency', ar: 'عملة التقرير' },
  opening: { en: 'Opening balance', ar: 'الرصيد الافتتاحي' },
  closing: { en: 'Closing balance', ar: 'الرصيد الختامي' },
  date: { en: 'Date', ar: 'التاريخ' },
  entry: { en: 'Entry', ar: 'القيد' },
  original: { en: 'Original amount', ar: 'المبلغ الأصلي' },
  effect: { en: 'Balance effect', ar: 'أثر الرصيد' },
  running: { en: 'Running balance', ar: 'الرصيد الجاري' },
  aging: { en: 'Aging summary', ar: 'ملخص أعمار الديون' },
  agingTotal: { en: 'Total outstanding', ar: 'إجمالي المستحق' },
} as const;

const typeLabels = {
  DEBT: 'Debt / دين',
  INSTALLMENT: 'Installment / قسط',
  PAYMENT: 'Payment / دفعة',
} as const;

const statusLabels: Record<CustomerStatementEntryStatus, string> = {
  POSTED: 'Posted / مرحّل',
  VOIDED: 'VOID / ملغاة',
  CANCELLED: 'CANCELLED / ملغى',
};

export function CustomerStatementDocument({ statement, business }: { statement: CustomerStatement; business: BusinessSettings }) {
  return (
    <article className="document-page customer-statement" aria-label={`Customer statement ${statement.customer.name}`}>
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
          <BilingualLabel label={labels.statement} className="text-xl font-black text-brand-800" />
          <Datum label={labels.period} value={`${formatBusinessDate(statement.range.from)} — ${formatBusinessDate(statement.range.to)}`} />
          <Datum label={labels.currency} value={statement.currency} />
        </div>
      </header>

      <section className="document-info-grid">
        <div>
          <BilingualLabel compact label={labels.customer} className="document-section-label" />
          <p className="user-text mt-2 font-bold" dir="auto">{statement.customer.name}</p>
          <p className="mt-1 text-sm" dir="ltr"><BilingualLabel compact label={labels.phone} /> {statement.customer.phone}</p>
          <p className="user-text-pre mt-1 text-sm" dir="auto"><BilingualLabel compact label={labels.address} /> {statement.customer.address ?? '—'}</p>
        </div>
        <dl className="document-facts">
          <MoneyFact label={labels.opening} field="openingBalance" value={statement.openingBalance} />
          <MoneyFact label={labels.closing} field="closingBalance" value={statement.closingBalance} strong />
        </dl>
      </section>

      <table className="document-table statement-table">
        <thead><tr>
          <th><BilingualLabel compact label={labels.date} /></th>
          <th><BilingualLabel compact label={labels.entry} /></th>
          <th className="text-right"><BilingualLabel compact label={labels.original} /></th>
          <th className="text-right"><BilingualLabel compact label={labels.effect} /></th>
          <th className="text-right"><BilingualLabel compact label={labels.running} /></th>
        </tr></thead>
        <tbody>
          {statement.entries.map((entry) => (
            <tr key={`${entry.type}-${entry.id}`} className={entry.status === 'POSTED' ? '' : 'statement-entry-inactive'}>
              <td dir="ltr">{formatBusinessDate(entry.date)}</td>
              <td><div className="font-semibold">{typeLabels[entry.type]} <span className={`statement-status statement-status-${entry.status.toLowerCase()}`}>{statusLabels[entry.status]}</span></div><p className="user-text mt-1" dir="auto">{entry.description}</p>{entry.reference && <p className="user-text text-xs text-slate-500" dir="auto">{entry.reference}</p>}{entry.dueDate && <p className="text-xs text-slate-500" dir="ltr">Due / الاستحقاق: {formatBusinessDate(entry.dueDate)}</p>}{entry.reason && <p className="user-text text-xs text-red-700" dir="auto">{entry.reason}</p>}</td>
              <td className="text-right"><DocumentMoney field={`entries.${entry.id}.originalAmount`} value={entry.originalAmount} currency={entry.currency} />{entry.currency !== 'USD' && <p className="mt-1 text-[7pt] text-slate-500" dir="ltr">{entry.exchangeRate} LBP / USD</p>}</td>
              <td className="text-right"><DocumentMoney field={`entries.${entry.id}.balanceEffect`} value={entry.balanceEffect} currency="USD" /></td>
              <td className="text-right font-semibold"><DocumentMoney field={`entries.${entry.id}.runningBalance`} value={entry.runningBalance} currency="USD" /></td>
            </tr>
          ))}
        </tbody>
      </table>

      <section className="statement-aging">
        <BilingualLabel label={labels.aging} className="document-section-label" />
        <div className="statement-aging-grid">
          {statement.aging.buckets.map((bucket) => <div key={bucket.key}><span>{bucket.label}</span><DocumentMoney field={`aging.${bucket.key}`} value={bucket.amount} currency="USD" /></div>)}
          <div className="document-total-strong"><BilingualLabel compact label={labels.agingTotal} /><DocumentMoney field="aging.total" value={statement.aging.total} currency="USD" /></div>
        </div>
      </section>
      <footer className="document-footer">Statement generated from posted transactions / كشف مُنشأ من القيود المرحّلة</footer>
    </article>
  );
}

function configured(value: string | null, en: string, ar: string) { return value || `[${en} not configured / ${ar} غير مضبوط]`; }

function Datum({ label, value }: { label: { en: string; ar: string }; value: string }) {
  return <div className="mt-2"><BilingualLabel compact label={label} className="justify-end text-xs font-semibold text-slate-500" /><p className="font-semibold" dir="ltr">{value}</p></div>;
}

function MoneyFact({ label, field, value, strong = false }: { label: { en: string; ar: string }; field: string; value: string; strong?: boolean }) {
  return <div className={strong ? 'document-total-strong p-2' : ''}><dt><BilingualLabel compact label={label} className="text-xs font-semibold text-slate-500" /></dt><dd className="mt-1 font-semibold"><DocumentMoney field={field} value={value} currency="USD" /></dd></div>;
}
