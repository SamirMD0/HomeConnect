import { Link } from 'react-router-dom';
import { AlertTriangle, Printer } from 'lucide-react';
import { PricingCard } from './PricingCard';
import type { PricingCardData, PricingCardTemplate, ShopProfile } from '../types/pricing-card.types';

interface Props {
  product: PricingCardData;
  template: PricingCardTemplate | null;
  shopProfile: ShopProfile;
  productName: string;
  missingTemplate: boolean;
  href: string;
}

/**
 * Lightweight card summary for the daily grid. The `<PricingCard>` renders in
 * thumbnail variant (no live barcode), scaled down inside a fixed 200×130 tile
 * via CSS transforms so hundreds fit without paying JsBarcode's paint cost.
 * Full-quality rendering happens on the print page.
 */
export function PricingCardThumbnail({ product, template, shopProfile, productName, missingTemplate, href }: Props) {
  return (
    <article className="group flex flex-col gap-2 rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
      <div
        data-testid="pricing-card-thumbnail-preview"
        className="pricing-card-thumbnail-viewport"
        aria-hidden
      >
        {template ? (
          <div className="pricing-card-thumbnail-scale">
            <PricingCard template={template} shopProfile={shopProfile} product={product} variant="thumbnail" assets={{ companyLogoUrl: shopProfile.logoDataUrl }} />
          </div>
        ) : (
          <div className="flex h-full items-center justify-center text-xs text-slate-400">No template resolved</div>
        )}
      </div>
      <div className="min-w-0">
        <p className="truncate text-sm font-semibold text-slate-900" title={productName}>{productName}</p>
        <div className="mt-0.5 flex items-center gap-1.5 text-xs text-slate-500">
          {missingTemplate
            ? <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 font-medium text-amber-800"><AlertTriangle className="h-3 w-3" />Missing template</span>
            : template
              ? <span className="truncate">{template.name}</span>
              : <span className="italic text-slate-400">No template</span>}
        </div>
      </div>
      <Link
        to={href}
        className="inline-flex items-center justify-center gap-2 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700"
      ><Printer className="h-3.5 w-3.5" /> Print</Link>
    </article>
  );
}
