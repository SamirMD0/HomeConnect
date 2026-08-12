export interface ConnectionSettings {
  host: string;
  port: number;
}

export type ScanStatus = 'FOUND' | 'NOT_FOUND' | 'INVALID_CODE';
export type ScanMatchedBy = 'BARCODE' | 'SKU' | null;

export interface ScannerProduct {
  id: string;
  name: string;
  model: string;
  sku: string;
  barcode: string | null;
  brand: string | null;
  isActive: boolean;
}

export interface ScanResult {
  status: ScanStatus;
  normalizedCode: string | null;
  matchedBy: ScanMatchedBy;
  product: ScannerProduct | null;
}

export interface PairingResult {
  token: string;
  expiresAt: string;
  deviceLabel: string;
}

export interface SessionResult {
  deviceLabel: string;
  expiresAt: string;
}

export interface ApiSuccess<T> {
  success: true;
  data: T;
}

export interface ApiFailure {
  success: false;
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
  meta: { timestamp: string };
}
