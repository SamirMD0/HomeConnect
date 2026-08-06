import React from 'react';
import { ProductLabelWarning } from '../types/product.types';

export const ProductLabelWarnings: React.FC<{ warnings: ProductLabelWarning[] }> = ({ warnings }) => {
  if (!warnings.length) return null;

  const archived = warnings.filter((warning) => warning.code === 'ARCHIVED_EXCLUDED');
  const missing = warnings.filter((warning) => warning.code === 'NOT_FOUND');
  const noPricing = warnings.filter((warning) => warning.code === 'NO_PRICING');
  const noManufacturerBarcode = warnings.filter((warning) => warning.code === 'MANUFACTURER_BARCODE_MISSING');
  const automaticFallback = warnings.filter((warning) => warning.code === 'FALLBACK_TO_SKU');

  const messages: string[] = [];
  if (archived.length) messages.push(`${archived.length} archived product${plural(archived.length)} excluded: ${names(archived)} / تم استبعاد المنتجات المؤرشفة.`);
  if (missing.length) messages.push(`${missing.length} selected product${plural(missing.length)} no longer available / بعض المنتجات المحددة لم تعد متاحة.`);
  if (noPricing.length) messages.push(`No pricing available for ${names(noPricing)} — the price code is blank / لا يوجد تسعير، لذلك رمز السعر فارغ.`);
  if (noManufacturerBarcode.length) messages.push(`No manufacturer barcode for ${names(noManufacturerBarcode)} — the SKU was encoded instead / لا يوجد باركود للشركة، فتم استخدام رمز المنتج.`);
  if (automaticFallback.length) messages.push(`No barcode saved for ${names(automaticFallback)} — the SKU will print instead / لا يوجد باركود محفوظ، فسيتم طباعة رمز المنتج.`);

  return (
    <div role="status" className="no-print rounded-lg border border-amber-200 bg-amber-50 p-3">
      <ul className="space-y-1 text-sm text-amber-900">
        {messages.map((message) => <li key={message} dir="auto">{message}</li>)}
      </ul>
    </div>
  );
};

const plural = (count: number) => (count === 1 ? '' : 's');
const names = (warnings: ProductLabelWarning[]) => warnings.map((warning) => warning.name ?? warning.productId).join(', ');
