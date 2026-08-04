import React, { useState } from 'react';
import { ArrowLeft, Printer } from 'lucide-react';
import { useNavigate, useParams } from 'react-router-dom';
import { ProductLabel } from '../../features/products/components/ProductLabel';
import { ProductLabelPrintSettings } from '../../features/products/components/ProductLabelPrintSettings';
import { useProductLabel } from '../../features/products/hooks/useProducts';
import { loadProductLabelDimensions } from '../../features/products/utils/product-label-settings';

export const ProductLabelPage: React.FC = () => {
  const { id = '' } = useParams(); const navigate = useNavigate(); const [showPrice, setShowPrice] = useState(true); const [showCode, setShowCode] = useState(true); const label = useProductLabel(id, showCode, showPrice); const [copies, setCopies] = useState(1); const [dimensions, setDimensions] = useState(loadProductLabelDimensions);
  if (label.isLoading) return <div className="p-12 text-center">Loading label...</div>;
  if (!label.data) return <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-red-700">Product label could not be loaded.</div>;
  return <div className="product-label-page space-y-5"><div className="no-print flex flex-wrap items-center justify-between gap-3"><button onClick={() => navigate(-1)} className="inline-flex items-center gap-2 rounded-lg border border-slate-300 px-3 py-2"><ArrowLeft className="h-4 w-4" /> Back / رجوع</button><div className="flex items-center gap-3"><label className="text-sm">Copies / النسخ <input type="number" min="1" max="40" value={copies} onChange={(e) => setCopies(Math.max(1, Math.min(40, Number(e.target.value))))} className="ml-2 w-20 rounded-lg border border-slate-300 px-2 py-2" /></label><button onClick={() => window.print()} className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 font-semibold text-white"><Printer className="h-4 w-4" /> Print / طباعة</button></div></div><ProductLabelPrintSettings dimensions={dimensions} onChange={setDimensions} showPrice={showPrice} onShowPriceChange={setShowPrice} showCode={showCode} onShowCodeChange={setShowCode} /><div className={`product-label-grid ${dimensions.autoFit ? 'product-label-grid-auto' : ''}`} style={{ '--label-width': `${dimensions.widthMm}mm` } as React.CSSProperties}>{Array.from({ length: copies }, (_, index) => <ProductLabel key={index} product={label.data} dimensions={dimensions} />)}</div></div>;
};
