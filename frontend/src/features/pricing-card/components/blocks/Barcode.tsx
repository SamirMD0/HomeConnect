import { useEffect, useMemo, useRef, useState } from 'react';
import JsBarcode from 'jsbarcode';
import { barcodeLayout, type BarcodeLayout } from '../../../products/utils/barcode-geometry';

export function Barcode({ value, targetWidthMm, showDigits }: { value: string; targetWidthMm: number; showDigits: boolean }) {
  const ref = useRef<SVGSVGElement>(null);
  const [failed, setFailed] = useState(false);
  const layout = useMemo(() => safeLayout(value, targetWidthMm), [value, targetWidthMm]);

  useEffect(() => {
    setFailed(false);
    if (!ref.current || !layout?.fits) return;
    try {
      JsBarcode(ref.current, value, { ...layout.options, displayValue: showDigits });
      sizeInMillimetres(ref.current, layout.moduleMm);
    } catch {
      setFailed(true);
    }
  }, [layout, showDigits, value]);

  if (!value || failed || !layout?.fits) return null;
  return <svg ref={ref} className="pricing-card-barcode" aria-label={`Barcode ${value}`} data-format={layout.format} />;
}

function safeLayout(value: string, targetWidthMm: number): BarcodeLayout | null {
  if (!value) return null;
  try { return barcodeLayout(value, targetWidthMm); } catch { return null; }
}

function sizeInMillimetres(svg: SVGSVGElement, moduleMm: number) {
  const units = (name: 'width' | 'height') => Number.parseFloat(svg.getAttribute(name) ?? '0');
  svg.setAttribute('width', `${units('width') * moduleMm}mm`);
  svg.setAttribute('height', `${units('height') * moduleMm}mm`);
  svg.setAttribute('shape-rendering', 'crispEdges');
}
