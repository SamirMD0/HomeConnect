/**
 * Selection limits for label printing. Mirrors `MAX_LABEL_SELECTION` in
 * `products.validator.ts` — the backend rejects anything larger, so the two must
 * agree. The frontend caps first purely so the user is told, rather than seeing
 * a 400.
 */
export const MAX_LABEL_SELECTION = 100;

/** Parses the `?ids=` query into a deduped, capped list. */
export function parseLabelIds(raw: string | null): string[] {
  return [...new Set((raw ?? '').split(',').map((id) => id.trim()).filter(Boolean))].slice(0, MAX_LABEL_SELECTION);
}
