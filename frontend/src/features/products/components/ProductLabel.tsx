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
  return <article className="product-label" style={{ '--label-width': `${dimensions.widthMm}mm`, '--label-height': `${dimensions.heightMm}mm` } as React.CSSProperties}>
    {product.brand && <p className="product-label-brand">{product.brand}</p>}
    <h2>{product.name}</h2><p>Model: <span>{product.model}</span></p><p className="product-label-sku">SKU: {product.sku}</p>
    {barcodeFailed ? <p className="product-label-barcode-text">{product.barcodeValue}</p> : <svg ref={svgRef} className="product-label-barcode" aria-label={`Barcode ${product.barcodeValue}`} />}
    {product.internalPriceCode && <p className="product-label-code">Code: {product.internalPriceCode}</p>}
  </article>;
};
