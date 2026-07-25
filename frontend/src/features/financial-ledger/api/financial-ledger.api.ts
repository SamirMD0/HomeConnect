import { api } from '../../../services/api';
import {
  FinancialLedgerFilters,
  FinancialLedgerResponse,
  FinancialLedgerResponseData,
} from '../types/financial-ledger.types';
import { buildFinancialLedgerParams } from '../utils/ledger-query';

export const financialLedgerApi = {
  getFinancialLedger: async (
    filters: FinancialLedgerFilters = {}
  ): Promise<FinancialLedgerResponseData> => {
    const response = await api.get<FinancialLedgerResponse>('/financial-ledger', {
      params: buildFinancialLedgerParams(filters),
    });
    return response.data.data;
  },
};
