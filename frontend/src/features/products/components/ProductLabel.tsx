import React, { useEffect, useRef, useState } from 'react';
import JsBarcode from 'jsbarcode';
import { LabelBarcodeSource, ProductLabelData } from '../types/product.types';
import { DEFAULT_PRODUCT_LABEL_DIMENSIONS, ProductLabelDimensions } from '../utils/product-label-settings';

export const ProductLabel: React.FC<{ product: ProductLabelData; dimensions?: ProductLabelDimensions; showCutGuides?: boolean }> = ({ product, dimensions = DEFAULT_PRODUCT_LABEL_DIMENSIONS, showCutGuides = false }) => {
  const svgRef = useRef<SVGSVGElement>(null);
  const [barcodeFailed, setBarcodeFailed] = useState(false);
  useEffect(() => {
    setBarcodeFailed(false);
    if (!product.barcodeValue || !svgRef.current) return;
    try {
      JsBarcode(svgRef.current, product.barcodeValue, barcodeOptions(product.barcodeSource, product.barcodeValue));
    } catch {
      try { JsBarcode(svgRef.current, product.barcodeValue, barcodeOptions(product.barcodeSource, product.barcodeValue, true)); }
      catch { setBarcodeFailed(true); }
    }
  }, [product.barcodeValue, product.barcodeSource]);
  const auto = automaticLabelSize(product);
  const widthMm = dimensions.autoFit ? auto.widthMm : dimensions.widthMm;
  const height = dimensions.autoFit ? 'auto' : `${dimensions.heightMm}mm`;
  return <article className={`product-label ${dimensions.autoFit ? 'product-label-auto' : ''} ${showCutGuides ? 'product-label-guides' : ''}`} style={{ '--label-width': `${widthMm}mm`, '--label-height': height } as React.CSSProperties}>
    {product.brand && <p className="product-label-brand">{product.brand}</p>}
    <h2>{product.name}</h2><p>Model: <span>{product.model}</span></p>
    {/* The staff code is the SKU plus an encoded price suffix. It prints under the
        plain "SKU:" caption so it reads as an ordinary product code to customers;
        only staff know the suffix carries the price. Never label it "Staff".
        This is the only place the code appears — the barcode prints no digits
        for a HomeConnect SKU (see barcodeOptions). */}
    <p className="product-label-sku">SKU: {product.staffLabelCode ?? product.sku}</p>
    {product.cashPrice && <p className="product-label-price">Price: {formatLabelPrice(product.cashPrice)}</p>}
    {barcodeFailed ? <p className="product-label-barcode-text">{product.barcodeValue}</p> : <svg ref={svgRef} className="product-label-barcode" aria-label={`Barcode ${product.barcodeValue}`} />}
  </article>;
};

/**
 * The digits under the bars are printed only for a manufacturer barcode, which
 * is a code the customer may legitimately see on the box. The HomeConnect SKU is
 * internal, so it is encoded for the scanner but never printed in the clear.
 */
export function barcodeOptions(source: Exclude<LabelBarcodeSource, 'AUTO'>, value = '', forceCode128 = false) {
  return {
    format: forceCode128 ? 'CODE128' as const : barcodeFormat(value),
    width: 1.25,
    height: 38,
    margin: 0,
    displayValue: source === 'MANUFACTURER',
    fontSize: 10,
  };
}

export function barcodeFormat(value: string): 'EAN13' | 'UPC' | 'EAN8' | 'CODE128' {
  if (/^\d{13}$/.test(value) && hasValidEan13Checksum(value)) return 'EAN13';
  if (/^\d{12}$/.test(value)) return 'UPC';
  if (/^\d{8}$/.test(value)) return 'EAN8';
  return 'CODE128';
}

function hasValidEan13Checksum(value: string): boolean {
  const digits = [...value].map(Number);
  const sum = digits.slice(0, 12).reduce((total, digit, index) => total + digit * (index % 2 === 0 ? 1 : 3), 0);
  return (10 - (sum % 10)) % 10 === digits[12];
}

function automaticLabelSize(product: ProductLabelData) {
  const longestLine = Math.max(product.name.length, product.model.length + 7, product.staffLabelCode?.length ?? product.sku.length + 5);
  return { widthMm: Math.min(80, Math.max(50, 50 + Math.ceil(Math.max(0, longestLine - 24) * 0.7))) };
}

export function formatLabelPrice(value: string): string {
  const [whole = '0', fraction = ''] = value.split('.');
  const rounded = (fraction[0] ?? '0') >= '5' ? BigInt(whole) + 1n : BigInt(whole);
  return `$${rounded.toString()}`;
}
