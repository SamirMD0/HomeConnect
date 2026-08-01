import React, { useState } from 'react';
import { Printer } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useProductLabel } from '../hooks/useProducts';
import { Product } from '../types/product.types';
import { loadProductLabelDimensions } from '../utils/product-label-settings';
import { ProductLabel } from './ProductLabel';

export const ProductLabelPanel: React.FC<{ product: Product }> = ({ product }) => {
  const [showCode, setShowCode] = useState(false); const [dimensions] = useState(loadProductLabelDimensions);
  const label = useProductLabel(product.id, showCode);
  return <div className="space-y-3"><div className="flex flex-wrap items-center justify-between gap-2"><label className="flex items-center gap-2 text-sm font-medium"><input type="checkbox" checked={showCode} onChange={(event) => setShowCode(event.target.checked)} />Show internal code / إظهار الرمز الداخلي</label><Link to={`/products/${product.id}/label`} className="inline-flex items-center gap-2 rounded-md border border-slate-300 px-3 py-2 text-sm font-semibold"><Printer className="h-4 w-4" />Print settings / إعدادات الطباعة</Link></div>{label.isLoading ? <div className="h-32 animate-pulse rounded bg-slate-100" /> : label.data ? <div className="overflow-x-auto rounded-lg bg-slate-100 p-3"><ProductLabel product={label.data} dimensions={dimensions} /></div> : <p className="text-sm text-red-600">Label preview unavailable.</p>}</div>;
};
