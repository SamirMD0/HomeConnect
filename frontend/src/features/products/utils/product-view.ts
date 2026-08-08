export type ProductView = 'table' | 'grid';

export function resolveProductView(params: Pick<URLSearchParams, 'get'>, storedView?: string | null): ProductView {
  const urlView = params.get('view');
  if (urlView === 'table' || urlView === 'grid') return urlView;
  return storedView === 'grid' ? 'grid' : 'table';
}

export function productViewSearchParams(params: URLSearchParams, view: ProductView): URLSearchParams {
  const next = new URLSearchParams(params);
  next.set('view', view);
  return next;
}

export function productSearchParams(params: URLSearchParams, search: string): URLSearchParams {
  const normalizedSearch = search.trim();
  const currentSearch = params.get('search') ?? '';

  // Pagination is only invalidated by a real search change. Returning the
  // existing params preserves `page` when another URL-backed control changes.
  if (currentSearch === normalizedSearch) return params;

  const next = new URLSearchParams(params);
  if (normalizedSearch) next.set('search', normalizedSearch);
  else next.delete('search');
  next.delete('page');
  return next;
}
