import { normalizeCustomerSearch } from './arabic-normalize';

export interface CustomerSearchHistoryEntry { query: string; at: number }
const KEY = 'homeconnect.customer-search-history';
const MAX = 10;

export function readCustomerSearchHistory(): CustomerSearchHistoryEntry[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(KEY) ?? '[]');
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item): item is CustomerSearchHistoryEntry =>
      typeof item?.query === 'string' && typeof item?.at === 'number'
    ).slice(0, MAX);
  } catch { return []; }
}

export function saveCustomerSearch(query: string): CustomerSearchHistoryEntry[] {
  const trimmed = query.trim();
  if (trimmed.length < 2) return readCustomerSearchHistory();
  const key = normalizeCustomerSearch(trimmed);
  const next = [{ query: trimmed, at: Date.now() }, ...readCustomerSearchHistory().filter((item) => normalizeCustomerSearch(item.query) !== key)].slice(0, MAX);
  try { localStorage.setItem(KEY, JSON.stringify(next)); } catch { /* device storage is optional */ }
  return next;
}

export function removeCustomerSearch(query: string): CustomerSearchHistoryEntry[] {
  const key = normalizeCustomerSearch(query);
  const next = readCustomerSearchHistory().filter((item) => normalizeCustomerSearch(item.query) !== key);
  try { localStorage.setItem(KEY, JSON.stringify(next)); } catch { /* optional */ }
  return next;
}

export function clearCustomerSearchHistory(): void {
  try { localStorage.removeItem(KEY); } catch { /* optional */ }
}
