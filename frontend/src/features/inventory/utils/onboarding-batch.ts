import type { BatchOpeningCountItem, OnboardingWorklistItem } from '../types/inventory.types';

export const ONBOARDING_BATCH_LIMIT = 100;
export const ONBOARDING_QUANTITY_LIMIT = 100_000;

export interface OnboardingSelectionEntry {
  product: OnboardingWorklistItem;
  count: number | '';
  note: string;
}

export type OnboardingSelection = Map<string, OnboardingSelectionEntry>;

export interface OnboardingInputIssue {
  productId: string;
  name: string;
  message: string;
}

export function addOnboardingSelection(
  current: OnboardingSelection,
  product: OnboardingWorklistItem
): { selection: OnboardingSelection; capped: boolean } {
  if (current.has(product.productId)) return { selection: current, capped: false };
  if (current.size >= ONBOARDING_BATCH_LIMIT) return { selection: current, capped: true };
  const next = new Map(current);
  next.set(product.productId, { product, count: '', note: '' });
  return { selection: next, capped: false };
}

export function removeOnboardingSelection(current: OnboardingSelection, productId: string): OnboardingSelection {
  const next = new Map(current);
  next.delete(productId);
  return next;
}

export function updateOnboardingSelection(
  current: OnboardingSelection,
  productId: string,
  patch: Partial<Pick<OnboardingSelectionEntry, 'count' | 'note'>>
): OnboardingSelection {
  const entry = current.get(productId);
  if (!entry) return current;
  const next = new Map(current);
  next.set(productId, { ...entry, ...patch });
  return next;
}

export function setAllOnboardingCountsToZero(current: OnboardingSelection): OnboardingSelection {
  return new Map([...current].map(([id, entry]) => [id, { ...entry, count: 0 }]));
}

export function onboardingSelectionCounts(selection: OnboardingSelection) {
  const entered = [...selection.values()].filter(({ count }) => count !== '').length;
  return { selected: selection.size, entered, incomplete: selection.size - entered };
}

export function validateOnboardingSelection(selection: OnboardingSelection): OnboardingInputIssue[] {
  const issues: OnboardingInputIssue[] = [];
  selection.forEach(({ product, count }) => {
    let message = '';
    if (count === '') message = 'Opening count is required / الجرد الافتتاحي مطلوب';
    else if (!Number.isInteger(count)) message = 'Enter a whole number / أدخل عددًا صحيحًا';
    else if (count < 0) message = 'Count cannot be negative / لا يمكن أن يكون الجرد سالبًا';
    else if (count > ONBOARDING_QUANTITY_LIMIT) message = 'Count exceeds 100,000 / الجرد يتجاوز 100,000';
    if (message) issues.push({ productId: product.productId, name: product.name, message });
  });
  return issues;
}

export function buildOnboardingItems(selection: OnboardingSelection): BatchOpeningCountItem[] {
  return [...selection.values()].map(({ product, count, note }) => ({
    productId: product.productId,
    openingCount: count === '' ? Number.NaN : count,
    note: note.trim() || null,
  }));
}

export function onboardingItemsSignature(items: BatchOpeningCountItem[]): string {
  return JSON.stringify(items.map(({ productId, openingCount, note }) => ({
    productId,
    openingCount,
    note: note ?? null,
  })));
}

export function onboardingPreviewMatches(selection: OnboardingSelection, previewSignature: string): boolean {
  return onboardingItemsSignature(buildOnboardingItems(selection)) === previewSignature;
}
