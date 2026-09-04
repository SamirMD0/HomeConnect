import { api } from '../../../services/api';
import type { ApiResponse, CreateExchangeRateInput, ExchangeRateRecord } from '../types/exchange-rate.types';

export const exchangeRatesApi = {
  async list(): Promise<ExchangeRateRecord[]> {
    const response = await api.get<ApiResponse<ExchangeRateRecord[]>>('/admin/exchange-rates');
    return response.data.data;
  },

  async create(input: CreateExchangeRateInput): Promise<ExchangeRateRecord> {
    const response = await api.post<ApiResponse<ExchangeRateRecord>>('/admin/exchange-rates', input);
    return response.data.data;
  },
};
