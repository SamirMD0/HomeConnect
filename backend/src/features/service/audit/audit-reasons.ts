/**
 * Server-generated audit reasons for the workflows that no longer ask the user
 * to type one.
 *
 * Normal product and service edits are ordinary work, so v1.8.1 stopped
 * demanding a typed justification for them. The audit row still needs a reason —
 * `ServiceAudit.reason` is NOT NULL and `writeServiceAudit` rejects anything
 * shorter than five characters — so the service layer supplies it here.
 *
 * These are deliberately NOT accepted from the client. A reason the browser can
 * choose is a reason an attacker can choose, and the audit trail is the control
 * that replaced the password prompt. Every string is built from the action and
 * the fields that actually changed; the detail lives in beforeValues/afterValues.
 */

/** Fields whose change is better described as "the barcode changed". */
const BARCODE_FIELDS = ['barcode', 'labelBarcodeSource'];
const SPECIFICATION_FIELDS = ['specifications', 'specificationNotes'];
const IMAGE_FIELDS = ['imageUrl'];

export const PRODUCT_AUDIT_REASONS = {
  details: 'Product details updated / تم تحديث تفاصيل المنتج',
  barcode: 'Product barcode updated / تم تحديث باركود المنتج',
  image: 'Product image updated / تم تحديث صورة المنتج',
  specifications: 'Product specifications updated / تم تحديث مواصفات المنتج',
  sku: 'Product SKU updated / تم تحديث رمز المنتج',
  skuRegenerated: 'Product SKU regenerated / تم توليد رمز المنتج من جديد',
  stockSettings: 'Product stock settings updated / تم تحديث إعدادات مخزون المنتج',
} as const;

/**
 * Picks the narrowest accurate description of a product edit. Anything touching
 * more than one group falls back to the general "details" wording rather than
 * listing fields, which the value diff already does better.
 */
export function productUpdateReason(changedFields: string[]): string {
  if (!changedFields.length) return PRODUCT_AUDIT_REASONS.details;
  if (changedFields.every((field) => SPECIFICATION_FIELDS.includes(field))) {
    return PRODUCT_AUDIT_REASONS.specifications;
  }
  if (changedFields.every((field) => BARCODE_FIELDS.includes(field))) {
    return PRODUCT_AUDIT_REASONS.barcode;
  }
  if (changedFields.every((field) => IMAGE_FIELDS.includes(field))) {
    return PRODUCT_AUDIT_REASONS.image;
  }
  return PRODUCT_AUDIT_REASONS.details;
}

export const SERVICE_JOB_AUDIT_REASONS: Record<string, string> = {
  UPDATE_DETAILS: 'Service job updated / تم تحديث طلب الصيانة',
  CHANGE_PRICE: 'Service job pricing updated / تم تحديث تسعير طلب الصيانة',
  CHANGE_WARRANTY: 'Service job warranty updated / تم تحديث ضمان طلب الصيانة',
  CHANGE_ROUTING: 'Service job routing updated / تم تحديث توجيه طلب الصيانة',
  CHANGE_DATES: 'Service job dates updated / تم تحديث تواريخ طلب الصيانة',
};

/**
 * Derived from the audit action rather than the raw field list, so the reason and
 * the action can never describe two different things.
 */
export function serviceJobUpdateReason(action: string): string {
  return SERVICE_JOB_AUDIT_REASONS[action] ?? SERVICE_JOB_AUDIT_REASONS.UPDATE_DETAILS;
}

/**
 * Names both ends of the transition. This one carries real information the value
 * diff repeats but the audit list shows first, and it replaces the previous
 * `input.reason ?? ...` fallback so the text can no longer come from the client.
 */
export function serviceStatusChangeReason(from: string, to: string): string {
  return `Status changed from ${from} to ${to} / تم تغيير الحالة من ${from} إلى ${to}`;
}
