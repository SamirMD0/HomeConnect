import React from 'react';
import { ProductLabelWarning } from '../types/product.types';

export const ProductLabelWarnings: React.FC<{ warnings: ProductLabelWarning[] }> = ({ warnings }) => {
  if (!warnings.length) return null;

  const archived = warnings.filter((warning) => warning.code === 'ARCHIVED_EXCLUDED');
  const missing = warnings.filter((warning) => warning.code === 'NOT_FOUND');
  const noPricing = warnings.filter((warning) => warning.code === 'NO_PRICING');
  const noManufacturerBarcode = warnings.filter((warning) => warning.code === 'MANUFACTURER_BARCODE_MISSING');
  const automaticFallback = warnings.filter((warning) => warning.code === 'FALLBACK_TO_SKU');
  const secretNotSet = warnings.some((warning) => warning.code === 'SECRET_PRESET_NOT_SET');
  const secretAbovePublic = warnings.filter((warning) => warning.code === 'SECRET_ABOVE_PUBLIC');
  const secretEqualsPublic = warnings.filter((warning) => warning.code === 'SECRET_EQUALS_PUBLIC');
  const secretBelowCost = warnings.filter((warning) => warning.code === 'SECRET_BELOW_COST');
  const secretNoCost = warnings.filter((warning) => warning.code === 'SECRET_NO_COST');
  const secretEncodingMissing = warnings.filter((warning) => warning.code === 'SECRET_ENCODING_NOT_SET');
  const secretEncodingFailed = warnings.filter((warning) => warning.code === 'SECRET_ENCODING_FAILED');
  const unsafeDiscountStages = warnings.filter((warning) => warning.code === 'SECRET_DISCOUNT_STAGES_UNSAFE');
  const secretFailed = warnings.filter((warning) => warning.code === 'SECRET_PRICE_FAILED');

  const messages: string[] = [];
  if (archived.length) messages.push(`${archived.length} archived product${plural(archived.length)} excluded: ${names(archived)} / تم استبعاد المنتجات المؤرشفة.`);
  if (missing.length) messages.push(`${missing.length} selected product${plural(missing.length)} no longer available / بعض المنتجات المحددة لم تعد متاحة.`);
  if (noPricing.length) messages.push(`No cost-based pricing for ${names(noPricing)} — the staff price code is blank, and the price too unless a manual price is set / لا يوجد تسعير من التكلفة، لذلك رمز السعر فارغ، والسعر أيضاً ما لم يُحدَّد سعر يدوي.`);
  if (noManufacturerBarcode.length) messages.push(`No manufacturer barcode for ${names(noManufacturerBarcode)} — the SKU was encoded instead / لا يوجد باركود للشركة، فتم استخدام رمز المنتج.`);
  if (secretNotSet) messages.push('No hidden pricing preset is selected — staff code left blank / لم يتم تحديد صيغة السعر الداخلي، لذلك الرمز فارغ.');
  if (secretAbovePublic.length) messages.push(`Secret price is above the selling price for ${names(secretAbovePublic)} — staff code left blank / السعر السري أعلى من سعر البيع، لذلك الرمز فارغ.`);
  if (secretEqualsPublic.length) messages.push(`Hidden price equals the selling price for ${names(secretEqualsPublic)} — staff code left blank because it is not useful / السعر الداخلي يساوي سعر البيع، لذلك الرمز فارغ.`);
  if (secretBelowCost.length) messages.push(`Hidden price is below cost for ${names(secretBelowCost)} — staff code left blank / السعر الداخلي أقل من التكلفة، لذلك الرمز فارغ.`);
  if (secretNoCost.length) messages.push(`No cost is recorded for ${names(secretNoCost)} — staff code left blank / لا توجد تكلفة، لذلك الرمز فارغ.`);
  if (secretEncodingMissing.length) messages.push(`No encoding preset is selected for ${names(secretEncodingMissing)} — staff code left blank / لم يتم تحديد صيغة الترميز.`);
  if (secretEncodingFailed.length) messages.push(`The encoding rule is invalid for ${names(secretEncodingFailed)} — staff code left blank / قاعدة الترميز غير صالحة.`);
  if (unsafeDiscountStages.length) messages.push(`The manual discount steps exceed the safe maximum for ${names(unsafeDiscountStages)} — staff code left blank / خطوات الخصم اليدوية تتجاوز الحد الآمن، لذلك الرمز فارغ.`);
  if (secretFailed.length) messages.push(`Secret price could not be calculated for ${names(secretFailed)} — staff code left blank / تعذر حساب السعر السري، لذلك الرمز فارغ.`);
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
