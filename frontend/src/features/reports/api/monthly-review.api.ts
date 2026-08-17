import { api } from '../../../services/api';
import type { MonthlyReviewQuery, MonthlyReviewResponse } from '../types/monthly-review.types';

export const monthlyReviewApi = {
  get: async (query: MonthlyReviewQuery): Promise<Omit<MonthlyReviewResponse, 'success'>> => {
    const response = await api.get<MonthlyReviewResponse>('/reports/monthly-review', {
      params: {
        period: query.period,
        ...(query.period === 'custom' ? { from: query.from, to: query.to } : {}),
      },
    });
    const { meta, data } = response.data;
    return { meta, data };
  },
  exportCsv: async (query: MonthlyReviewQuery): Promise<Blob> => {
    const response = await api.get<Blob>('/reports/monthly-review/export.csv', {
      params: {
        period: query.period,
        ...(query.period === 'custom' ? { from: query.from, to: query.to } : {}),
      },
      responseType: 'blob',
    });
    return response.data;
  },
};
