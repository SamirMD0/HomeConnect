import React, { useState } from 'react';
import { ArrowLeft, Tags } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useProductBrands } from '../../features/products/hooks/useProducts';
import type { ProductBrandSummary } from '../../features/products/types/product.types';
import { BrandFixDialog } from '../../features/products/components/BrandFixDialog';

export const BrandsPage: React.FC = () => {
  const brands = useProductBrands();
  const [fixingBrand, setFixingBrand] = useState<ProductBrandSummary | null>(null);

  return <div className="space-y-5">
    <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <div className="flex items-center gap-3"><Tags className="h-7 w-7 text-emerald-600" /><h1 className="text-2xl font-bold text-slate-900">Brands / الماركات</h1></div>
        <p className="mt-1 text-sm text-slate-500">Review and standardize brand spellings used by products / مراجعة وتوحيد تهجئات الماركات المستخدمة في المنتجات.</p>
      </div>
      <Link to="/products" className="inline-flex items-center gap-2 self-start rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700"><ArrowLeft className="h-4 w-4" />Products / المنتجات</Link>
    </header>

    {brands.isLoading && <div className="rounded-lg border border-slate-200 bg-white p-10 text-center text-slate-500">Loading brands / جارٍ تحميل الماركات…</div>}
    {brands.isError && <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-4 text-red-700">Unable to load brands / تعذر تحميل الماركات.</div>}
    {brands.data && <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-slate-200 text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
            <tr><th className="px-4 py-3">Canonical brand / الماركة</th><th className="px-4 py-3">Products / المنتجات</th><th className="px-4 py-3">Spellings / التهجئات</th><th className="px-4 py-3">Variants / الأشكال</th><th className="px-4 py-3"><span className="sr-only">Actions / الإجراءات</span></th></tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {brands.data.map((brand) => <tr key={brand.canonical} className={brand.spellings.length > 1 ? 'bg-amber-50/50' : ''}>
              <td className="px-4 py-3 font-semibold"><Link dir="auto" className="text-emerald-700 hover:underline" to={`/products?brand=${encodeURIComponent(brand.canonical)}`}>{brand.canonical}</Link></td>
              <td className="px-4 py-3 tabular-nums text-slate-700">{brand.productCount}</td>
              <td className="px-4 py-3"><span className={brand.spellings.length > 1 ? 'rounded-full bg-amber-100 px-2 py-1 font-semibold text-amber-800' : 'text-slate-600'}>{brand.spellings.length} {brand.spellings.length === 1 ? 'spelling' : 'spellings'}</span></td>
              <td className="px-4 py-3 text-slate-600">{brand.spellings.length > 1 ? <span dir="auto">{brand.spellings.join(' · ')}</span> : <span className="text-slate-400">—</span>}</td>
              <td className="px-4 py-3 text-right">{brand.spellings.length > 1 && <button type="button" onClick={() => setFixingBrand(brand)} className="rounded-lg border border-amber-300 bg-white px-3 py-1.5 text-xs font-semibold text-amber-800 hover:bg-amber-50">Fix spellings / توحيد التهجئة</button>}</td>
            </tr>)}
            {brands.data.length === 0 && <tr><td colSpan={5} className="px-4 py-10 text-center text-slate-500">No brands found / لا توجد ماركات.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>}
    {fixingBrand && <BrandFixDialog brand={fixingBrand} open onClose={() => setFixingBrand(null)} />}
  </div>;
};
