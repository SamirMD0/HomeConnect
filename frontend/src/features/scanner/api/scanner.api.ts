import { api } from '../../../services/api';
import { LanStatus, PairingCode, RecentEventsPage, ScanLookupResult, ScannerSession } from '../types/scanner.types';

export const scannerApi = {
  lanStatus: async (): Promise<LanStatus> => (await api.get('/scanner/lan-status')).data.data,
  enableLan: async (): Promise<LanStatus> => (await api.post('/scanner/lan/enable')).data.data,
  /** Also revokes every paired phone — the backend treats disabling as final. */
  disableLan: async (): Promise<LanStatus> => (await api.post('/scanner/lan/disable')).data.data,
  createPairingCode: async (): Promise<PairingCode> => (await api.post('/scanner/pairing-code')).data.data,
  sessions: async (): Promise<ScannerSession[]> => (await api.get('/scanner/sessions')).data.data,
  revokeSession: async (id: string): Promise<ScannerSession> =>
    (await api.post(`/scanner/sessions/${id}/revoke`)).data.data,

  /** Scans recorded since `since`, including those a paired phone sent. */
  recentEvents: async (since: number): Promise<RecentEventsPage> =>
    (await api.get('/scanner/events/recent', { params: { since } })).data.data,

  /**
   * Exact-match lookup. Lives here rather than in productsApi because the same
   * call will later be made by the phone scanner, which owns no product state.
   */
  scan: async (code: string): Promise<ScanLookupResult> =>
    (await api.get('/products/scan', { params: { code } })).data.data,
};
