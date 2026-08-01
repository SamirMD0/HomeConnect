import React, { useState } from 'react';
import { useQueries } from '@tanstack/react-query';
import { ArrowLeft, Printer } from 'lucide-react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { productsApi } from '../../features/products/api/products.api';
import { ProductLabel } from '../../features/products/components/ProductLabel';
import { ProductLabelPrintSettings } from '../../features/products/components/ProductLabelPrintSettings';
import { productKeys } from '../../features/products/hooks/useProducts';
import { loadProductLabelDimensions } from '../../features/products/utils/product-label-settings';

export const ProductLabelsPage: React.FC = () => {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const ids = [...new Set((params.get('ids') ?? '').split(',').map((id) => id.trim()).filter(Boolean))].slice(0, 40);
  const [showCode, setShowCode] = useState(false); const [dimensions, setDimensions] = useState(loadProductLabelDimensions);
  const labels = useQueries({ queries: ids.map((id) => ({ queryKey: productKeys.label(id, showCode), queryFn: () => productsApi.label(id, showCode), retry: false })) });
  const ready = labels.flatMap((query) => query.data ? [query.data] : []);
  const loading = labels.some((query) => query.isLoading);

  return <div className="product-label-page space-y-5">
    <div className="no-print flex flex-wrap items-center justify-between gap-3">
      <button type="button" onClick={() => navigate('/products')} className="inline-flex items-center gap-2 rounded-lg border border-slate-300 px-3 py-2"><ArrowLeft className="h-4 w-4" /> Products / المنتجات</button>
      <div className="flex items-center gap-3"><span className="text-sm text-slate-600">{ready.length} labels / ملصقات</span><button type="button" disabled={!ready.length || loading} onClick={() => window.print()} className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 font-semibold text-white disabled:opacity-50"><Printer className="h-4 w-4" /> Print / طباعة</button></div>
    </div>
    <ProductLabelPrintSettings dimensions={dimensions} onChange={setDimensions} showCode={showCode} onShowCodeChange={setShowCode} />
    {loading && <p className="no-print p-8 text-center text-slate-500">Loading labels…</p>}
    {!loading && !ready.length && <p className="no-print rounded-lg border border-amber-200 bg-amber-50 p-4 text-amber-800">No valid product labels were found / لم يتم العثور على ملصقات صالحة.</p>}
    <div className="product-label-grid" style={{ '--label-width': `${dimensions.widthMm}mm` } as React.CSSProperties}>{ready.map((product) => <ProductLabel key={product.id} product={product} dimensions={dimensions} />)}</div>
  </div>;
};
