import { ArrowLeft } from 'lucide-react';
import { Link, useParams } from 'react-router-dom';
import { EmptyState, SkeletonText, buttonClasses } from '../../components/ui';
import { DocumentActions } from '../../features/documents/components/DocumentActions';
import { DocumentPrintStyles } from '../../features/documents/components/DocumentPrintStyles';
import { SalesInvoiceDocument } from '../../features/documents/components/SalesInvoiceDocument';
import { useBusinessSettings } from '../../features/documents/hooks/useBusinessSettings';
import { useSalesOrder } from '../../features/sales-orders/hooks/useSalesOrders';

export function SalesInvoicePage() {
  const { id = '' } = useParams<{ id: string }>();
  const order = useSalesOrder(id);
  const business = useBusinessSettings();
  if (order.isLoading || business.isLoading) return <div className="mx-auto max-w-4xl rounded-lg bg-white p-8"><SkeletonText lines={10} /></div>;
  if (order.isError || business.isError || !order.data || !business.data) {
    return <EmptyState title="Invoice unavailable / الفاتورة غير متوفرة" description="The order or business settings could not be loaded." action={<Link to={`/sales-orders/${id}`} className={buttonClasses('secondary')}>Back / رجوع</Link>} />;
  }
  return (
    <div className="document-route space-y-4">
      <DocumentPrintStyles />
      <div className="no-print mx-auto flex max-w-[210mm] flex-wrap items-center justify-between gap-3">
        <Link to={`/sales-orders/${id}`} className={buttonClasses('secondary')}><ArrowLeft className="h-4 w-4" /> Order / الطلب</Link>
        <DocumentActions fileName={`invoice-${order.data.orderNumber}.pdf`} />
      </div>
      <SalesInvoiceDocument order={order.data} business={business.data} />
    </div>
  );
}
