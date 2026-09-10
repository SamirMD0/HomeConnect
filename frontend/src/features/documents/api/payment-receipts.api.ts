import { api } from '../../../services/api';
import type { PaymentReceipt } from '../types/document.types';

export const paymentReceiptsApi = {
  get: async (paymentId: string): Promise<PaymentReceipt> =>
    (await api.get(`/payments/${paymentId}/receipt`)).data.data,
};
