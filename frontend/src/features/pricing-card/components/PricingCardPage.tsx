import { useMemo, useRef, type CSSProperties } from 'react';
import { usePreviewScale } from '../../products/components/ProductLabelSheet';
import {
  calculateLabelSheetLayout,
  chunkIntoPages,
  PAPER_CSS_SIZE,
  type LabelSheetLayout,
} from '../../products/utils/label-sheet-layout';
import type { PricingCardData, PricingCardTemplate, ShopProfile } from '../types/pricing-card.types';
import { PricingCard, type PricingCardAssets } from './PricingCard';

export interface PricingCardPageItem {
  product: PricingCardData;
  assets?: PricingCardAssets;
}

interface PricingCardPageProps {
  cards: PricingCardPageItem[];
  template: PricingCardTemplate;
  shopProfile: ShopProfile;
  layout?: LabelSheetLayout;
  pageMarginMm?: number;
  cardGapMm?: number;
  showCutGuides?: boolean;
}

export function PricingCardPage({
  cards, template, shopProfile, layout, pageMarginMm = 8, cardGapMm = 3, showCutGuides = false,
}: PricingCardPageProps) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const widthMm = finiteMillimetres(template.cardWidthMm);
  const heightMm = finiteMillimetres(template.cardHeightMm);
  const paper = template.paperSize === 'LETTER' ? 'LETTER' : 'A4';
  const sheetLayout = useMemo(() => layout ?? calculateLabelSheetLayout({
    paper, labelWidthMm: widthMm, labelHeightMm: heightMm, pageMarginMm, labelGapMm: cardGapMm, columns: 'AUTO',
  }, cards.length), [cardGapMm, cards.length, heightMm, layout, pageMarginMm, paper, widthMm]);
  const isSheet = template.paperMode === 'SHEET';
  const scale = usePreviewScale(viewportRef, isSheet ? sheetLayout.paper.widthMm : widthMm, true);
  const pages = isSheet ? chunkIntoPages(cards, sheetLayout.perPage) : cards.map((card) => [card]);
  const pageRule = isSheet
    ? `@page { size: ${PAPER_CSS_SIZE[paper]}; margin: 0; }`
    : `@page { size: ${widthMm}mm ${heightMm}mm; margin: 0; }`;

  if (isSheet && !sheetLayout.canPrint) return null;

  return (
    <div ref={viewportRef} className="pricing-card-page-viewport">
      <style>{pageRule}</style>
      <div className="pricing-card-page-preview" style={{ '--preview-scale': scale } as CSSProperties}>
        {pages.map((page, pageIndex) => (
          <section
            key={pageIndex}
            className={`pricing-card-page ${isSheet ? 'pricing-card-page-sheet' : 'pricing-card-page-fixed'}`}
            aria-label={`Page ${pageIndex + 1} of ${pages.length}`}
            style={{
              '--pricing-card-paper-width': `${isSheet ? sheetLayout.paper.widthMm : widthMm}mm`,
              '--pricing-card-paper-height': `${isSheet ? sheetLayout.paper.heightMm : heightMm}mm`,
              '--pricing-card-page-margin': `${isSheet ? pageMarginMm : 0}mm`,
              '--pricing-card-columns': isSheet ? sheetLayout.columns : 1,
              '--pricing-card-cell-width': `${widthMm}mm`,
              '--pricing-card-cell-height': `${heightMm}mm`,
              '--pricing-card-page-gap': `${isSheet ? cardGapMm : 0}mm`,
            } as CSSProperties}
          >
            {page.map((item, cardIndex) => (
              <PricingCard
                key={`${item.product.id}-${cardIndex}`}
                template={template}
                product={item.product}
                shopProfile={shopProfile}
                assets={item.assets}
                className={showCutGuides ? 'pricing-card-cut-guides' : ''}
              />
            ))}
          </section>
        ))}
      </div>
    </div>
  );
}

function finiteMillimetres(value: string) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) throw new Error(`Invalid pricing card size: ${value}`);
  return parsed;
}
