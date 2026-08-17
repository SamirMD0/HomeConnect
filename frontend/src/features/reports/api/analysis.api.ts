import { api } from '../../../services/api';
import type { AnalysisEnvelope } from '../types/analysis.types';
import type { MonthlyReviewQuery } from '../types/monthly-review.types';

function params(query: MonthlyReviewQuery) {
  return { period: query.period, ...(query.period === 'custom' ? { from: query.from, to: query.to } : {}) };
}

export const analysisApi = {
  get: async (query: MonthlyReviewQuery): Promise<AnalysisEnvelope> => {
    const response = await api.get<{ success: true } & AnalysisEnvelope>('/reports/analysis', { params: params(query) });
    return { meta: response.data.meta, data: response.data.data };
  },
  exportCsv: async (query: MonthlyReviewQuery): Promise<Blob> => {
    const response = await api.get<Blob>('/reports/analysis/export.csv', { params: params(query), responseType: 'blob' });
    return response.data;
  },
};
