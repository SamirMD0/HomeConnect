import { api } from '../../../services/api';
import {
  DeliverPrepaidPayload,
  PrepaidDetailResponse,
  PrepaidFilters,
  PrepaidListData,
  PrepaidListResponse,
  PrepaidPurchase,
  RevertPrepaidDeliveryPayload,
} from '../types/prepaid.types';
import { buildPrepaidParams } from '../utils/prepaid-query';

export const prepaidApi = {
  listPrepaidPurchases: async (filters: PrepaidFilters = {}): Promise<PrepaidListData> => {
    const response = await api.get<PrepaidListResponse>('/prepaid-purchases', {
      params: buildPrepaidParams(filters),
    });
    return response.data.data;
  },

  getPrepaidPurchase: async (id: string): Promise<PrepaidPurchase> => {
    const response = await api.get<PrepaidDetailResponse>(`/prepaid-purchases/${id}`);
    return response.data.data;
  },

  deliver: async (id: string, payload: DeliverPrepaidPayload): Promise<PrepaidPurchase> => {
    const response = await api.post<PrepaidDetailResponse>(
      `/prepaid-purchases/${id}/deliver`,
      payload
    );
    return response.data.data;
  },

  revertDelivery: async (
    id: string,
    payload: RevertPrepaidDeliveryPayload
  ): Promise<PrepaidPurchase> => {
    const response = await api.post<PrepaidDetailResponse>(
      `/prepaid-purchases/${id}/revert-delivery`,
      payload
    );
    return response.data.data;
  },
};
