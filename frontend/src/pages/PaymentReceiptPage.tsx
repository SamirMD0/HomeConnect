import { ArrowLeft } from 'lucide-react';
import { Link, useParams } from 'react-router-dom';
import { EmptyState, SkeletonText, buttonClasses } from '../components/ui';
import { DocumentActions } from '../features/documents/components/DocumentActions';
import { DocumentPrintStyles } from '../features/documents/components/DocumentPrintStyles';
import { PaymentReceiptDocument } from '../features/documents/components/PaymentReceiptDocument';
import { useBusinessSettings } from '../features/documents/hooks/useBusinessSettings';
import { usePaymentReceipt } from '../features/documents/hooks/usePaymentReceipt';

export function PaymentReceiptPage() {
  const { paymentId = '' } = useParams<{ paymentId: string }>();
  const receipt = usePaymentReceipt(paymentId);
  const business = useBusinessSettings();
  if (receipt.isLoading || business.isLoading) return <div className="mx-auto max-w-4xl rounded-lg bg-white p-8"><SkeletonText lines={10} /></div>;
  if (receipt.isError || business.isError || !receipt.data || !business.data) {
    return <EmptyState title="Receipt unavailable / الإيصال غير متوفر" description="The payment or business settings could not be loaded." action={<Link to="/ledger" className={buttonClasses('secondary')}>Back / رجوع</Link>} />;
  }
  return (
    <div className="document-route space-y-4">
      <DocumentPrintStyles />
      <div className="no-print mx-auto flex max-w-[210mm] flex-wrap items-center justify-between gap-3">
        <Link to={`/customers/${receipt.data.customer.id}`} className={buttonClasses('secondary')}><ArrowLeft className="h-4 w-4" /> Customer / الزبون</Link>
        <DocumentActions fileName={`payment-receipt-${receipt.data.id}.pdf`} />
      </div>
      <PaymentReceiptDocument receipt={receipt.data} business={business.data} />
    </div>
  );
}
