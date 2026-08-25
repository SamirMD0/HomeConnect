import { ServiceJobStatus } from '../../service/types/service.types';
import { TemplateLanguage } from '../types/communication.types';

/**
 * Customer-facing service status wording.
 *
 * Deliberately separate from `service-labels.ts` `STATUS_LABELS`, which is the
 * internal bilingual "English / عربي" badge text staff read. A customer reading
 * a WhatsApp message gets one language, phrased for them.
 */
export const customerFacingServiceStatus: Record<ServiceJobStatus, Record<TemplateLanguage, string>> = {
  RECEIVED: { EN: 'Received', AR: 'تم الاستلام' },
  INSPECTION_PENDING: { EN: 'Awaiting inspection', AR: 'بانتظار الفحص' },
  IN_WORKSHOP_REPAIR: { EN: 'Under repair in our workshop', AR: 'قيد التصليح في الورشة' },
  SENT_TO_COMPANY: { EN: 'Sent to the company', AR: 'أرسل إلى الشركة' },
  COMPANY_HOME_MAINTENANCE: { EN: 'Company home visit', AR: 'زيارة منزلية من الشركة' },
  WAITING_FOR_PART: { EN: 'Waiting for a spare part', AR: 'بانتظار وصول القطعة' },
  WAITING_CUSTOMER_APPROVAL: { EN: 'Waiting for your approval', AR: 'بانتظار موافقتكم' },
  READY_FOR_PICKUP: { EN: 'Ready for pickup', AR: 'جاهز للاستلام' },
  DELIVERED_TO_CUSTOMER: { EN: 'Delivered', AR: 'تم التسليم' },
  PRODUCT_EXCHANGE: { EN: 'Product exchange', AR: 'استبدال المنتج' },
  CANCELLED: { EN: 'Cancelled', AR: 'ملغى' },
  NOT_REPAIRABLE: { EN: 'Not repairable', AR: 'غير قابل للتصليح' },
};

/**
 * Bad news that must never go out as a bare status label — the employee has to
 * write a human sentence in the custom note before Generate will succeed.
 */
export const SERVICE_STATUSES_REQUIRING_NOTE: ServiceJobStatus[] = ['NOT_REPAIRABLE', 'CANCELLED'];

export function requiresCustomNote(status: ServiceJobStatus | null | undefined): boolean {
  return status !== null && status !== undefined && SERVICE_STATUSES_REQUIRING_NOTE.includes(status);
}

export function serviceStatusForMessage(
  status: ServiceJobStatus | null | undefined,
  language: TemplateLanguage
): string {
  return status ? customerFacingServiceStatus[status][language] : '';
}
