import React, { useEffect, useRef, useState } from 'react';
import JsBarcode from 'jsbarcode';
import { ProductLabelData } from '../types/product.types';
import { DEFAULT_PRODUCT_LABEL_DIMENSIONS, ProductLabelDimensions } from '../utils/product-label-settings';

export const ProductLabel: React.FC<{ product: ProductLabelData; dimensions?: ProductLabelDimensions }> = ({ product, dimensions = DEFAULT_PRODUCT_LABEL_DIMENSIONS }) => {
  const svgRef = useRef<SVGSVGElement>(null);
  const [barcodeFailed, setBarcodeFailed] = useState(false);
  useEffect(() => {
    setBarcodeFailed(false);
    if (!product.barcodeValue || !svgRef.current) return;
    try { JsBarcode(svgRef.current, product.barcodeValue, { format: 'CODE128', width: 1.25, height: 38, margin: 0, displayValue: true, fontSize: 10 }); }
    catch { setBarcodeFailed(true); }
  }, [product.barcodeValue]);
  const auto = automaticLabelSize(product);
  const widthMm = dimensions.autoFit ? auto.widthMm : dimensions.widthMm;
  const height = dimensions.autoFit ? 'auto' : `${dimensions.heightMm}mm`;
  return <article className={`product-label ${dimensions.autoFit ? 'product-label-auto' : ''}`} style={{ '--label-width': `${widthMm}mm`, '--label-height': height } as React.CSSProperties}>
    {product.brand && <p className="product-label-brand">{product.brand}</p>}
    <h2>{product.name}</h2><p>Model: <span>{product.model}</span></p>
    {/* The staff code is the SKU plus an encoded price suffix. It prints under the
        plain "SKU:" caption so it reads as an ordinary product code to customers;
        only staff know the suffix carries the price. Never label it "Staff". */}
    <p className="product-label-sku">SKU: {product.staffLabelCode ?? product.sku}</p>
    {product.cashPrice && <p className="product-label-price">Price: {formatLabelPrice(product.cashPrice)}</p>}
    {barcodeFailed ? <p className="product-label-barcode-text">{product.barcodeValue}</p> : <svg ref={svgRef} className="product-label-barcode" aria-label={`Barcode ${product.barcodeValue}`} />}
  </article>;
};

function automaticLabelSize(product: ProductLabelData) {
  const longestLine = Math.max(product.name.length, product.model.length + 7, product.staffLabelCode?.length ?? product.sku.length + 5);
  return { widthMm: Math.min(80, Math.max(50, 50 + Math.ceil(Math.max(0, longestLine - 24) * 0.7))) };
}

export function formatLabelPrice(value: string): string {
  const [whole = '0', fraction = ''] = value.split('.');
  const rounded = (fraction[0] ?? '0') >= '5' ? BigInt(whole) + 1n : BigInt(whole);
  return `$${rounded.toString()}`;
}
