/** Mirrors `ProductScanPayload` in backend/src/features/service/products/products.service.ts. */
export interface ScannedProduct {
  id: string;
  name: string;
  model: string;
  sku: string;
  barcode: string | null;
  brand: string | null;
  isActive: boolean;
}

export type ScanStatus = 'FOUND' | 'NOT_FOUND' | 'INVALID_CODE';

/** Mirrors `ProductScanResult`. Deliberately carries no pricing or stock field. */
export interface ScanLookupResult {
  status: ScanStatus;
  normalizedCode: string | null;
  matchedBy: 'BARCODE' | 'SKU' | null;
  alsoMatchedSku?: boolean;
  product: ScannedProduct | null;
}

export type ScanSource = 'PC_SCANNER' | 'PHONE_SCANNER';

/** Mirrors `ScannerEvent` in backend/src/features/scanner/scanner.store.ts. */
export interface ScannerEventRecord {
  id: number;
  sessionId: string | null;
  source: ScanSource;
  code: string;
  status: ScanStatus;
  productId: string | null;
  createdAt: string;
}

export interface RecentEventsPage {
  events: ScannerEventRecord[];
  latestEventId: number;
}

/**
 * Listener state, as reported by the backend.
 *
 * `STARTING` is transient, and `ERROR` means the socket could not be bound —
 * almost always the port already being in use.
 */
export type LanScannerMode = 'DISABLED' | 'STARTING' | 'AVAILABLE' | 'ERROR';

/** Mirrors `LanListenerStatus` in backend/src/features/scanner/lan-listener.ts. */
export interface LanStatus {
  mode: LanScannerMode;
  host: string;
  port: number;
  /** Every private IPv4 this PC has; the first is the likeliest to work. */
  addresses: string[];
  urls: string[];
  activeSessionCount: number;
  error: string | null;
  firewall: { command: string; note: string };
}

/** Mirrors `ScannerSessionView`. Carries no token material. */
export interface ScannerSession {
  id: string;
  deviceLabel: string;
  createdAt: string;
  expiresAt: string;
  lastSeenAt: string;
  revokedAt: string | null;
  isActive: boolean;
}

export interface PairingCode {
  code: string;
  expiresAt: string;
}

export interface RecentScan {
  /** Stable within a session; the list is in-memory and dies with the page. */
  id: string;
  code: string;
  status: ScanStatus;
  source: ScanSource;
  productId: string | null;
  productName: string | null;
  scannedAt: string;
}
