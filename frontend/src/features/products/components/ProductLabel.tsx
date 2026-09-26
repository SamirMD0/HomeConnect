import React, { useEffect, useMemo, useRef, useState } from 'react';
import JsBarcode from 'jsbarcode';
import { ProductLabelData } from '../types/product.types';
import { barcodeLayout, BarcodeLayout } from '../utils/barcode-geometry';
import { DEFAULT_PRODUCT_LABEL_DIMENSIONS, ProductLabelDimensions } from '../utils/product-label-settings';

export { barcodeFormat } from '../utils/barcode-geometry';

/** `.product-label` has 2mm of padding on each side. */
const LABEL_PADDING_MM = 4;
const AUTO_MAX_WIDTH_MM = 80;

export const ProductLabel: React.FC<{ product: ProductLabelData; dimensions?: ProductLabelDimensions; showCutGuides?: boolean }> = ({ product, dimensions = DEFAULT_PRODUCT_LABEL_DIMENSIONS, showCutGuides = false }) => {
  const svgRef = useRef<SVGSVGElement>(null);
  const [barcodeFailed, setBarcodeFailed] = useState(false);
  const widthMm = dimensions.autoFit ? automaticLabelSize(product).widthMm : dimensions.widthMm;
  const layout = useMemo(() => safeLayout(product.barcodeValue, widthMm - LABEL_PADDING_MM), [product.barcodeValue, widthMm]);
  useEffect(() => {
    setBarcodeFailed(false);
    const svg = svgRef.current;
    if (!product.barcodeValue || !svg || !layout?.fits) return;
    try {
      JsBarcode(svg, product.barcodeValue, layout.options);
      sizeInMillimetres(svg, layout.moduleMm);
    } catch { setBarcodeFailed(true); }
  }, [product.barcodeValue, layout]);
  const height = dimensions.autoFit ? 'auto' : `${dimensions.heightMm}mm`;
  const showBars = !barcodeFailed && layout !== null && layout.fits;
  return <article className={`product-label ${dimensions.autoFit ? 'product-label-auto' : ''} ${showCutGuides ? 'product-label-guides' : ''}`} style={{ '--label-width': `${widthMm}mm`, '--label-height': height } as React.CSSProperties}>
    {product.brand && <p className="product-label-brand">{product.brand}</p>}
    <h2>{product.name}</h2><p>Model: <span>{product.model}</span></p>
    {/* The staff code is the SKU plus an encoded price suffix. It prints under the
        plain "SKU:" caption so it reads as an ordinary product code to customers;
        only staff know the suffix carries the price. Never label it "Staff".
        It is display-only: the barcode below encodes the plain SKU or the
        manufacturer barcode, never this code. */}
    <p className="product-label-sku">SKU: {product.staffLabelCode ?? product.sku}</p>
    {product.cashPrice && <p className="product-label-price">Price: {formatLabelPrice(product.cashPrice)}</p>}
    {/* The digits under the bars are always exactly the encoded value, so staff
        can key it in by hand when a scan fails. */}
    {showBars
      ? <svg ref={svgRef} className="product-label-barcode" aria-label={`Barcode ${product.barcodeValue}`} />
      : <>
          <p className="product-label-barcode-text">{product.barcodeValue}</p>
          {layout && !layout.fits && <p className="no-print text-xs text-red-700">Barcode too long for this label — use Large / الباركود أطول من الملصق</p>}
        </>}
  </article>;
};

function safeLayout(value: string, availableWidthMm: number): BarcodeLayout | null {
  if (!value) return null;
  try { return barcodeLayout(value, availableWidthMm); } catch { return null; }
}

/**
 * JsBarcode sizes the SVG in its own units — one per module, because the
 * options use `width: 1`. Re-declaring the size in millimetres fixes every
 * module at exactly `moduleMm` on paper, whatever the label box does.
 */
function sizeInMillimetres(svg: SVGSVGElement, moduleMm: number) {
  const units = (name: 'width' | 'height') => Number.parseFloat(svg.getAttribute(name) ?? '0');
  svg.setAttribute('width', `${units('width') * moduleMm}mm`);
  svg.setAttribute('height', `${units('height') * moduleMm}mm`);
  svg.setAttribute('shape-rendering', 'crispEdges');
}

function automaticLabelSize(product: ProductLabelData) {
  const longestLine = Math.max(product.name.length, product.model.length + 7, product.staffLabelCode?.length ?? product.sku.length + 5);
  const textWidthMm = Math.min(AUTO_MAX_WIDTH_MM, Math.max(50, 50 + Math.ceil(Math.max(0, longestLine - 24) * 0.7)));
  const barcode = safeLayout(product.barcodeValue, AUTO_MAX_WIDTH_MM - LABEL_PADDING_MM);
  const barcodeWidthMm = barcode?.fits ? barcode.widthMm + LABEL_PADDING_MM : 0;
  return { widthMm: Math.min(AUTO_MAX_WIDTH_MM, Math.max(textWidthMm, Math.ceil(barcodeWidthMm))) };
}

export function formatLabelPrice(value: string): string {
  const [whole = '0', fraction = ''] = value.split('.');
  const rounded = (fraction[0] ?? '0') >= '5' ? BigInt(whole) + 1n : BigInt(whole);
  return `$${rounded.toString()}`;
}
