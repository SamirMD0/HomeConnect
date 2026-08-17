import { api } from '../../../services/api';
import type { ReportRowsEnvelope, ReportRowsQuery, ReportSlice } from '../types/report-rows.types';

const paths: Record<ReportSlice, string> = {
  'customers-new': 'customers/new', 'customers-debts': 'customers/debts',
  'customers-payments': 'customers/payments', 'customers-aging': 'customers/receivables-aging',
  'customers-not-paid': 'customers/not-paid', 'customers-paid': 'customers/paid',
  'suppliers-debts': 'suppliers/debts',
  'suppliers-receiving': 'suppliers/receiving', 'sales-orders': 'sales/orders',
  'sales-unpaid': 'sales/unpaid', 'inventory-movements': 'inventory/movements',
  'inventory-reconciliation': 'inventory/reconciliation', 'products-bought': 'products/bought',
};

function params(query: ReportRowsQuery) {
  return { period: query.period, ...(query.period === 'custom' ? { from: query.from, to: query.to } : {}) };
}

export const reportRowsApi = {
  get: async (slice: ReportSlice, query: ReportRowsQuery): Promise<ReportRowsEnvelope> => {
    const response = await api.get<{ success: true } & ReportRowsEnvelope>(`/reports/${paths[slice]}`, { params: params(query) });
    return { meta: response.data.meta, data: response.data.data };
  },
  exportCsv: async (slice: ReportSlice, query: ReportRowsQuery): Promise<Blob> => {
    const response = await api.get<Blob>(`/reports/${paths[slice]}/export.csv`, { params: params(query), responseType: 'blob' });
    return response.data;
  },
};
