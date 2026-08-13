import { describe, expect, it } from 'vitest';
import { userTextSchema } from '../../../validators/user-text';
import {
  PRODUCT_AUDIT_REASONS,
  SERVICE_JOB_AUDIT_REASONS,
  productUpdateReason,
  serviceJobUpdateReason,
  serviceStatusChangeReason,
} from './audit-reasons';

// writeServiceAudit parses every reason through this schema, so a generated
// string that fails it would throw at audit-write time rather than in review.
const reasonSchema = userTextSchema({ field: 'Reason', min: 5, max: 1000 });

describe('generated audit reasons', () => {
  const allReasons = [
    ...Object.values(PRODUCT_AUDIT_REASONS),
    ...Object.values(SERVICE_JOB_AUDIT_REASONS),
    serviceStatusChangeReason('RECEIVED', 'INSPECTION_PENDING'),
  ];

  it('produces reasons that writeServiceAudit will accept', () => {
    for (const reason of allReasons) {
      expect(() => reasonSchema.parse(reason)).not.toThrow();
    }
  });

  it('is bilingual in the house English / عربي format', () => {
    for (const reason of allReasons) {
      expect(reason).toContain(' / ');
    }
  });

  it('narrows to the specification wording only when nothing else changed', () => {
    expect(productUpdateReason(['specifications'])).toBe(PRODUCT_AUDIT_REASONS.specifications);
    expect(productUpdateReason(['specifications', 'specificationNotes'])).toBe(PRODUCT_AUDIT_REASONS.specifications);
    expect(productUpdateReason(['specifications', 'name'])).toBe(PRODUCT_AUDIT_REASONS.details);
  });

  it('narrows to the barcode wording for barcode and label-source edits', () => {
    expect(productUpdateReason(['barcode'])).toBe(PRODUCT_AUDIT_REASONS.barcode);
    expect(productUpdateReason(['barcode', 'labelBarcodeSource'])).toBe(PRODUCT_AUDIT_REASONS.barcode);
    expect(productUpdateReason(['barcode', 'price'])).toBe(PRODUCT_AUDIT_REASONS.details);
  });

  it('narrows to the image wording for an image-only edit', () => {
    expect(productUpdateReason(['imageUrl'])).toBe(PRODUCT_AUDIT_REASONS.image);
  });

  it('falls back to the general wording for mixed or empty edits', () => {
    expect(productUpdateReason(['name', 'model'])).toBe(PRODUCT_AUDIT_REASONS.details);
    expect(productUpdateReason([])).toBe(PRODUCT_AUDIT_REASONS.details);
  });

  it('maps every service-job audit action to its own wording', () => {
    expect(serviceJobUpdateReason('CHANGE_PRICE')).toBe(SERVICE_JOB_AUDIT_REASONS.CHANGE_PRICE);
    expect(serviceJobUpdateReason('CHANGE_WARRANTY')).toBe(SERVICE_JOB_AUDIT_REASONS.CHANGE_WARRANTY);
    expect(serviceJobUpdateReason('CHANGE_ROUTING')).toBe(SERVICE_JOB_AUDIT_REASONS.CHANGE_ROUTING);
    expect(serviceJobUpdateReason('CHANGE_DATES')).toBe(SERVICE_JOB_AUDIT_REASONS.CHANGE_DATES);
    expect(serviceJobUpdateReason('UPDATE_DETAILS')).toBe(SERVICE_JOB_AUDIT_REASONS.UPDATE_DETAILS);
  });

  it('falls back to the general service wording for an unmapped action', () => {
    expect(serviceJobUpdateReason('SOMETHING_NEW')).toBe(SERVICE_JOB_AUDIT_REASONS.UPDATE_DETAILS);
  });

  it('names both ends of a status transition', () => {
    expect(serviceStatusChangeReason('RECEIVED', 'READY_FOR_PICKUP'))
      .toBe('Status changed from RECEIVED to READY_FOR_PICKUP / تم تغيير الحالة من RECEIVED إلى READY_FOR_PICKUP');
  });
});
