import { useQuery } from '@tanstack/react-query';
import { paymentReceiptsApi } from '../api/payment-receipts.api';

export const paymentReceiptKey = (paymentId: string) => ['payment-receipt', paymentId] as const;

export function usePaymentReceipt(paymentId: string) {
  return useQuery({
    queryKey: paymentReceiptKey(paymentId),
    queryFn: () => paymentReceiptsApi.get(paymentId),
    enabled: Boolean(paymentId),
  });
}
