import { ArrowLeft } from 'lucide-react';
import { FormEvent, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { EmptyState, SkeletonText, buttonClasses } from '../../components/ui';
import { CustomerStatementDocument } from '../../features/documents/components/CustomerStatementDocument';
import { DocumentActions } from '../../features/documents/components/DocumentActions';
import { DocumentPrintStyles } from '../../features/documents/components/DocumentPrintStyles';
import { useBusinessSettings } from '../../features/documents/hooks/useBusinessSettings';
import { useCustomerStatement } from '../../features/documents/hooks/useCustomerStatement';

export function CustomerStatementPage() {
  const { id = '' } = useParams<{ id: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const today = new Date().toISOString().slice(0, 10);
  const from = searchParams.get('from') ?? `${today.slice(0, 4)}-01-01`;
  const to = searchParams.get('to') ?? today;
  const [draftFrom, setDraftFrom] = useState(from);
  const [draftTo, setDraftTo] = useState(to);
  const statement = useCustomerStatement(id, from, to);
  const business = useBusinessSettings();
  const applyRange = (event: FormEvent) => { event.preventDefault(); if (draftFrom <= draftTo) setSearchParams({ from: draftFrom, to: draftTo }); };

  if (statement.isLoading || business.isLoading) return <div className="mx-auto max-w-4xl rounded-lg bg-white p-8"><SkeletonText lines={10} /></div>;
  if (statement.isError || business.isError || !statement.data || !business.data) {
    return <EmptyState title="Statement unavailable / كشف الحساب غير متوفر" description="The customer statement or business settings could not be loaded." action={<Link to={`/customers/${id}`} className={buttonClasses('secondary')}>Back / رجوع</Link>} />;
  }
  return (
    <div className="document-route space-y-4">
      <DocumentPrintStyles />
      <div className="no-print mx-auto flex max-w-[210mm] flex-wrap items-end justify-between gap-3">
        <Link to={`/customers/${id}`} className={buttonClasses('secondary')}><ArrowLeft className="h-4 w-4" /> Customer / الزبون</Link>
        <form className="flex flex-wrap items-end gap-2" onSubmit={applyRange}>
          <label className="text-xs font-semibold text-slate-600">From / من<input className="mt-1 block rounded border border-slate-300 px-2 py-1.5" type="date" value={draftFrom} onChange={(event) => setDraftFrom(event.target.value)} /></label>
          <label className="text-xs font-semibold text-slate-600">To / إلى<input className="mt-1 block rounded border border-slate-300 px-2 py-1.5" type="date" value={draftTo} onChange={(event) => setDraftTo(event.target.value)} /></label>
          <button className={buttonClasses('secondary')} type="submit" disabled={!draftFrom || !draftTo || draftFrom > draftTo}>Apply / تطبيق</button>
        </form>
        <DocumentActions fileName={`statement-${statement.data.customer.id}-${from}-${to}.pdf`} />
      </div>
      <CustomerStatementDocument statement={statement.data} business={business.data} />
    </div>
  );
}
