/** Mirrors `LocalStatus` in backend/src/features/system/system.service.ts. */
export type DatabaseStatus = 'CONNECTED' | 'UNAVAILABLE';

/**
 * Owned by the scanner feature — the system status endpoint only reports it.
 * Re-exported so existing importers here are unaffected.
 */
export type { LanScannerMode } from '../../scanner/types/scanner.types';
import type { LanScannerMode } from '../../scanner/types/scanner.types';

export interface LocalStatus {
  backend: 'UP';
  database: DatabaseStatus;
  lanScanner: { mode: LanScannerMode };
  appVersion: string;
  serverTime: string;
}

/**
 * What the chips actually render. `UNKNOWN` is not a backend state: it is what
 * the database signal becomes once the backend is unreachable, because at that
 * point the app has no basis for claiming the database is either up or down.
 */
export type DatabaseSignal = DatabaseStatus | 'UNKNOWN';
