import axios from 'axios';
import type { SupplierReceiving, SupplierReceivingItem, SupplierReceivingStatus } from '../types/supplier-receiving.types';

/**
 * Preserves the server's bilingual message, which is the only place that knows
 * *why* a correction was refused — which product was short, or that money is
 * still posted against the delivery.
 */
export function receivingCorrectionErrorMessage(error: unknown): string {
  const fallback = 'Unable to complete this correction / تعذر إتمام هذا التصحيح';
  return axios.isAxiosError(error) ? error.response?.data?.error?.message ?? fallback : fallback;
}

/** A document with no explicit status came from before corrections existed, so it is posted. */
export function receivingStatus(receiving: Pick<SupplierReceiving, 'status'>): SupplierReceivingStatus {
  return receiving.status ?? 'POSTED';
}

export function isReceivingVoided(receiving: Pick<SupplierReceiving, 'status'>): boolean {
  return receivingStatus(receiving) === 'VOIDED';
}

/** Correction actions belong to admins only; everyone else sees the same document, read-only. */
export function canCorrectReceiving(role: string | undefined, receiving: Pick<SupplierReceiving, 'status'>): boolean {
  return role === 'ADMIN' && !isReceivingVoided(receiving);
}

/** The lines a void would still give back — an already-reversed line is not reversed twice. */
export function reversibleLines(receiving: SupplierReceiving): SupplierReceivingItem[] {
  return (receiving.items ?? []).filter((item) => (item.status ?? 'ACTIVE') === 'ACTIVE');
}

export const receivingStatusLabel: Record<SupplierReceivingStatus, string> = {
  POSTED: 'Posted / مُرحَّل',
  VOIDED: 'Voided / ملغى',
};

const REASON_REQUIRED = 'A reason of at least 5 characters is required / يجب ذكر سبب من 5 أحرف على الأقل';
const PASSWORD_REQUIRED = 'Your account password is required / كلمة مرور حسابك مطلوبة';

/** The same minimum the server enforces, so an admin is told before the round trip. */
export function correctionReasonError(reason: string): string | null {
  return reason.trim().length < 5 ? REASON_REQUIRED : null;
}

export function voidRequestError(reason: string, accountPassword: string): string | null {
  return correctionReasonError(reason) ?? (accountPassword ? null : PASSWORD_REQUIRED);
}
