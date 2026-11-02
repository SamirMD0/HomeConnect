import { BilingualLabel } from '../../../components/ui';
import { formatBusinessDate } from '../../customer-financial/utils/financial-format';
import type { BusinessSettings, SupplierStatement } from '../types/document.types';
import { DocumentBranchLine } from './DocumentBranchLine';
import { DocumentMoney } from './DocumentMoney';
import { toSupplierStatementRows } from './SupplierStatementPanel';

const labels = {
  statement: { en: 'SUPPLIER STATEMENT', ar: 'كشف حساب مورّد' },
  period: { en: 'Statement period', ar: 'فترة كشف الحساب' },
  supplier: { en: 'Supplier', ar: 'المورّد' },
  phone: { en: 'Phone', ar: 'الهاتف' },
  currency: { en: 'Reporting currency', ar: 'عملة التقرير' },
  opening: { en: 'Opening balance', ar: 'الرصيد الافتتاحي' },
  closing: { en: 'Closing balance', ar: 'الرصيد الختامي' },
  date: { en: 'Date', ar: 'التاريخ' },
  entry: { en: 'Entry', ar: 'القيد' },
  debit: { en: 'Debit', ar: 'مدين' },
  credit: { en: 'Credit', ar: 'دائن' },
  balance: { en: 'Balance', ar: 'الرصيد' },
} as const;

export function SupplierStatementDocument({ statement, business }: { statement: SupplierStatement; business: BusinessSettings }) {
  const rows = toSupplierStatementRows(statement.entries);
  return (
    <article className="document-page customer-statement" aria-label={`Supplier statement ${statement.supplier.name}`}>
      <header className="document-header">
        <div className="flex min-w-0 items-start gap-4">
          {business.logoUrl
            ? <img className="document-logo" src={business.logoUrl} alt="Business logo / شعار المتجر" />
            : <div className="document-logo-placeholder">Logo<br /><span dir="rtl">الشعار</span></div>}
          <div className="min-w-0">
            <h1 className="user-text text-2xl font-black text-slate-950" dir="auto">{business.shopName || '[Shop name not configured / اسم المتجر غير مضبوط]'}</h1>
            {business.address && <p className="user-text-pre mt-1 text-sm text-slate-700" dir="auto">{business.address}</p>}
            {business.phone && <p className="mt-1 text-sm" dir="ltr">{business.phone}</p>}
            <DocumentBranchLine data={statement} />
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
          <BilingualLabel compact label={labels.supplier} className="document-section-label" />
          <p className="user-text mt-2 font-bold" dir="auto">{statement.supplier.name}</p>
          {statement.supplier.companyName && <p className="user-text mt-1 text-sm" dir="auto">{statement.supplier.companyName}</p>}
          <p className="mt-1 text-sm" dir="ltr"><BilingualLabel compact label={labels.phone} /> {statement.supplier.phone}</p>
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
          <th className="text-right"><BilingualLabel compact label={labels.debit} /></th>
          <th className="text-right"><BilingualLabel compact label={labels.credit} /></th>
          <th className="text-right"><BilingualLabel compact label={labels.balance} /></th>
        </tr></thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id} className={row.inactiveLabel ? 'statement-entry-inactive' : ''}>
              <td dir="ltr">{formatBusinessDate(row.date)}</td>
              <td>
                <div className="font-semibold">{row.type}{row.inactiveLabel && <span className="statement-status statement-status-cancelled">{row.inactiveLabel}</span>}</div>
                <p className="user-text mt-1" dir="auto">{row.description}</p>
                {row.reference && <p className="mt-1" dir="ltr">{row.reference}</p>}
                {row.reason && <p className="user-text mt-1" dir="auto">{row.reason}</p>}
              </td>
              <td className="text-right">{row.debit ? <DocumentMoney field={`entries.${row.id}.debit`} value={row.debit} currency="USD" /> : '—'}</td>
              <td className="text-right">{row.credit ? <DocumentMoney field={`entries.${row.id}.credit`} value={row.credit} currency="USD" /> : '—'}</td>
              <td className="text-right font-semibold"><DocumentMoney field={`entries.${row.id}.balance`} value={row.balance} currency="USD" /></td>
            </tr>
          ))}
        </tbody>
      </table>
      <footer className="document-footer">Statement generated from posted transactions / كشف مُنشأ من القيود المرحّلة</footer>
    </article>
  );
}

function Datum({ label, value }: { label: { en: string; ar: string }; value: string }) {
  return <div className="mt-2"><BilingualLabel compact label={label} className="justify-end text-xs font-semibold text-slate-500" /><p className="font-semibold" dir="ltr">{value}</p></div>;
}

function MoneyFact({ label, field, value, strong = false }: { label: { en: string; ar: string }; field: string; value: string; strong?: boolean }) {
  return <div className={strong ? 'document-total-strong p-2' : ''}><dt><BilingualLabel compact label={label} className="text-xs font-semibold text-slate-500" /></dt><dd className="mt-1 font-semibold"><DocumentMoney field={field} value={value} currency="USD" /></dd></div>;
}
