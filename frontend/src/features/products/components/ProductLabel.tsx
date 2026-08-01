import React, { useEffect, useRef, useState } from 'react';
import JsBarcode from 'jsbarcode';
import { ProductLabelData } from '../types/product.types';
import { businessLabels } from '../../../shared/labels/business-labels';

export const ProductLabel: React.FC<{ product: ProductLabelData }> = ({ product }) => {
  const svgRef = useRef<SVGSVGElement>(null);
  const [barcodeFailed, setBarcodeFailed] = useState(false);
  useEffect(() => {
    setBarcodeFailed(false);
    if (!product.barcode || !svgRef.current) return;
    try { JsBarcode(svgRef.current, product.barcode, { format: 'CODE128', width: 1.4, height: 42, margin: 0, displayValue: true, fontSize: 11 }); }
    catch { setBarcodeFailed(true); }
  }, [product.barcode]);
  return <article className="product-label user-text" dir="auto">
    {product.brand && <p className="product-label-brand" dir="auto">{product.brand}</p>}
    <h2 dir="auto">{product.name}</h2><p>{businessLabels.product.model}: <span dir="auto">{product.model}</span></p>
    {product.barcode && (barcodeFailed ? <p className="product-label-barcode-text">{product.barcode}</p> : <svg ref={svgRef} className="product-label-barcode" aria-label={`Barcode ${product.barcode}`} />)}
    {product.price && <p className="product-label-price">{businessLabels.product.price}: ${product.price}</p>}
  </article>;
};
