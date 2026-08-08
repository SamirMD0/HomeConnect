import { LanScannerMode, ScannerSession } from '../types/scanner.types';

/**
 * Only an admin may open the shop Wi-Fi door, mint a code, or revoke a phone.
 * Everyone else sees the same page read-only — the backend enforces this too,
 * so this is about not showing a button that would fail.
 */
export function canManageScanner(role: string | undefined): boolean {
  return role === 'ADMIN';
}

export type LanTone = 'good' | 'bad' | 'muted' | 'busy';

export interface LanModeView {
  tone: LanTone;
  label: string;
  /** Whether phones can reach the PC right now. */
  reachable: boolean;
}

export function describeLanMode(mode: LanScannerMode | undefined): LanModeView {
  switch (mode) {
    case 'AVAILABLE':
      return { tone: 'good', label: 'LAN Scanner Available / ماسح الشبكة متاح', reachable: true };
    case 'STARTING':
      return { tone: 'busy', label: 'Starting… / جارٍ التشغيل', reachable: false };
    case 'ERROR':
      return { tone: 'bad', label: 'LAN Scanner Error / خطأ في ماسح الشبكة', reachable: false };
    default:
      return { tone: 'muted', label: 'LAN Scanner Off / ماسح الشبكة متوقف', reachable: false };
  }
}

export const PAIRING_CODE_EXPIRED = 'expired';

/**
 * Whole seconds left on a pairing code.
 *
 * Floored at zero rather than going negative: a lapsed code is simply expired,
 * and counting upwards past zero would read as though it were still usable.
 */
export function secondsRemaining(expiresAt: string, now: number = Date.now()): number {
  const remaining = Math.ceil((Date.parse(expiresAt) - now) / 1000);
  return Number.isNaN(remaining) ? 0 : Math.max(0, remaining);
}

/** `m:ss`, or the expired marker once the clock runs out. */
export function formatCountdown(seconds: number): string {
  if (seconds <= 0) return PAIRING_CODE_EXPIRED;
  const minutes = Math.floor(seconds / 60);
  return `${minutes}:${String(seconds % 60).padStart(2, '0')}`;
}

/**
 * The address most likely to work.
 *
 * The backend already ranks the shop router's range first; this only picks a
 * default so the operator is not forced to choose before trying anything.
 */
export function defaultUrl(urls: string[]): string | null {
  return urls[0] ?? null;
}

/**
 * A session the operator can act on.
 *
 * Revoked and expired sessions are shown rather than hidden — "the phone I
 * revoked is gone" is worth being able to see — but they are clearly inactive.
 */
export function describeSession(session: ScannerSession): { label: string; tone: 'good' | 'muted' } {
  if (session.revokedAt) return { label: 'Revoked / ملغاة', tone: 'muted' };
  if (!session.isActive) return { label: 'Expired / منتهية', tone: 'muted' };
  return { label: 'Active / نشطة', tone: 'good' };
}

/** Compact "how long ago", for a last-seen column that must not wrap. */
export function formatLastSeen(lastSeenAt: string, now: number = Date.now()): string {
  const seconds = Math.floor((now - Date.parse(lastSeenAt)) / 1000);
  if (Number.isNaN(seconds) || seconds < 0) return '—';
  if (seconds < 60) return 'just now / الآن';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}
