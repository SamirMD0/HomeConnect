import { ArrowLeft } from 'lucide-react';
import { Link, useParams } from 'react-router-dom';
import { EmptyState, SkeletonText, buttonClasses } from '../../components/ui';
import { DocumentActions } from '../../features/documents/components/DocumentActions';
import { DocumentPrintStyles } from '../../features/documents/components/DocumentPrintStyles';
import { SalesReturnDocument } from '../../features/documents/components/SalesReturnDocument';
import { useBusinessSettings } from '../../features/documents/hooks/useBusinessSettings';
import { useSalesReturn } from '../../features/documents/hooks/useSalesReturn';

export function SalesReturnPage() {
  const { returnId = '' } = useParams<{ returnId: string }>();
  const result = useSalesReturn(returnId);
  const business = useBusinessSettings();
  if (result.isLoading || business.isLoading) return <div className="mx-auto max-w-4xl rounded-lg bg-white p-8"><SkeletonText lines={10} /></div>;
  if (!result.data || !business.data) return <EmptyState title="Sales return unavailable / مستند المرتجع غير متوفر" description="The return or business settings could not be loaded." />;
  return <div className="document-route space-y-4"><DocumentPrintStyles /><div className="no-print mx-auto flex max-w-[210mm] justify-between gap-3"><Link to={`/sales-orders/${result.data.salesOrderId}`} className={buttonClasses('secondary')}><ArrowLeft className="h-4 w-4" /> Order / الطلب</Link><DocumentActions fileName={`sales-return-${result.data.returnNumber}.pdf`} /></div><SalesReturnDocument salesReturn={result.data} business={business.data} /></div>;
}
