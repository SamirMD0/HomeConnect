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
