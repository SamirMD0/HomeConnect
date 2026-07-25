import { api } from '../../../services/api';

export interface DiagnosticsHealth {
  status: string;
  database: string;
  appVersion: string;
  logPath: string;
}

export interface ErrorLogRecord {
  timestamp: string;
  method?: string;
  path?: string;
  query?: Record<string, any>;
  status?: number;
  errorCode?: string;
  message: string;
  stack?: string;
  appVersion: string;
}

export const diagnosticsApi = {
  getHealth: async (): Promise<DiagnosticsHealth> => {
    const res = await api.get('/admin/diagnostics/health');
    return res.data.data;
  },
  
  getErrors: async (limit = 20): Promise<ErrorLogRecord[]> => {
    const res = await api.get('/admin/diagnostics/errors', { params: { limit } });
    return res.data.data;
  },
  
  clearErrors: async (): Promise<void> => {
    await api.post('/admin/diagnostics/clear-errors');
  },

  reportError: async (data: { route: string; message: string; stack?: string; timestamp: string; errorCode?: string }): Promise<void> => {
    await api.post('/admin/diagnostics/report-error', data);
  }
};
