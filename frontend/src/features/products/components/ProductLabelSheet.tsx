import React, { useEffect, useRef, useState } from 'react';
import { ProductLabelData } from '../types/product.types';
import { chunkIntoPages, LabelSheetLayout } from '../utils/label-sheet-layout';
import { ProductLabelSheetSettings } from '../utils/product-label-settings';
import { ProductLabel } from './ProductLabel';

interface ProductLabelSheetProps {
  labels: ProductLabelData[];
  settings: ProductLabelSheetSettings;
  layout: LabelSheetLayout;
}

/**
 * Renders the labels as physical pages.
 *
 * One `.label-page` element per printed page, each a real paper-sized block in
 * millimetres. The preview is therefore the same DOM the printer receives — it
 * matches by construction rather than by keeping two stylesheets in agreement.
 */
export const ProductLabelSheet: React.FC<ProductLabelSheetProps> = ({ labels, settings, layout }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const scale = usePreviewScale(containerRef, layout.paper.widthMm, settings.mode === 'SHEET');

  const dimensions = { widthMm: settings.labelWidthMm, heightMm: settings.labelHeightMm, autoFit: false };

  // Sticker stock: one label per page, sized by the injected @page rule. No
  // sheet geometry applies, so the labels are simply listed.
  if (settings.mode === 'STICKER') {
    return (
      <div className="product-label-grid" style={{ '--label-width': `${settings.labelWidthMm}mm` } as React.CSSProperties}>
        {labels.map((label) => <ProductLabel key={label.id} product={label} dimensions={dimensions} />)}
      </div>
    );
  }

  if (!layout.canPrint) return null;

  const pages = chunkIntoPages(labels, layout.perPage);

  return (
    <div ref={containerRef} className="label-sheet-viewport">
      <div className="label-sheet-preview" style={{ '--preview-scale': scale } as React.CSSProperties}>
        {pages.map((page, index) => (
          <section
            key={index}
            className="label-page"
            aria-label={`Page ${index + 1} of ${pages.length}`}
            style={{
              '--paper-width': `${layout.paper.widthMm}mm`,
              '--paper-height': `${layout.paper.heightMm}mm`,
              '--page-margin': `${settings.pageMarginMm}mm`,
              '--label-columns': layout.columns,
              '--label-width': `${settings.labelWidthMm}mm`,
              '--label-height': `${settings.labelHeightMm}mm`,
              '--label-gap': `${settings.labelGapMm}mm`,
            } as React.CSSProperties}
          >
            {page.map((label) => (
              <ProductLabel key={label.id} product={label} dimensions={dimensions} showCutGuides={settings.showCutGuides} />
            ))}
          </section>
        ))}
      </div>
    </div>
  );
};

/**
 * An A4 page is wider than most panes, so the preview is optically reduced with
 * a transform. Scaling the container rather than the labels keeps every
 * millimetre measurement intact — the print output is never affected.
 */
function usePreviewScale(ref: React.RefObject<HTMLDivElement | null>, paperWidthMm: number, enabled: boolean) {
  const [scale, setScale] = useState(1);

  useEffect(() => {
    if (!enabled) return;
    const element = ref.current;
    if (!element || typeof ResizeObserver === 'undefined') return;

    const measure = () => {
      const available = element.clientWidth;
      if (!available) return;
      // 96 CSS px per inch, 25.4 mm per inch.
      const paperPx = (paperWidthMm / 25.4) * 96;
      setScale(Math.min(1, available / paperPx));
    };

    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [ref, paperWidthMm, enabled]);

  return scale;
}
