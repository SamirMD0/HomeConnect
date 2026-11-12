import type { ReadPage } from '@shared/lookup-contracts';
export const LOOKUP_PAGE_SIZE = 25;
/** Outer pagination metadata is not consumed by the Phase 1 JSON client. One
 * additional empty page is safe when the final server page is exactly full. */
export function serverPage<T>(items: T[], page: number, pageSize = LOOKUP_PAGE_SIZE): ReadPage<T> {
  if (!Array.isArray(items))
    throw new Error('The PC returned an invalid list. Update HomeConnect and retry.');
  return { items, nextPage: items.length >= pageSize ? page + 1 : undefined };
}
/** Existing statement/report/bill APIs return a complete collection. Paginate
 * its presentation without deriving or changing any server money fields. */
export function collectionPage<T>(
  items: T[],
  page: number,
  pageSize = LOOKUP_PAGE_SIZE
): ReadPage<T> {
  const start = (page - 1) * pageSize;
  return {
    items: items.slice(start, start + pageSize),
    nextPage: start + pageSize < items.length ? page + 1 : undefined,
  };
}
