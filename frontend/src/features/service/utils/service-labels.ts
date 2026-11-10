import { ServiceJobStatus, ServiceRequestType, ServiceRoutingDecision, WarrantyStatus } from '../types/service.types';

// Warranty-repair (RMA) wording: the "company" is the brand's manufacturer or
// its authorised service centre, which handles warranty repairs.
export const REQUEST_TYPE_LABELS: Record<ServiceRequestType, string> = { ON_CALL: 'Home visit', WORKSHOP_DROP_OFF: 'Dropped off at shop', PART_REPLACEMENT: 'Part replacement' };
export const STATUS_LABELS: Record<ServiceJobStatus, string> = { RECEIVED: 'Received', INSPECTION_PENDING: 'Awaiting inspection', IN_WORKSHOP_REPAIR: 'Repairing in our workshop', SENT_TO_COMPANY: 'Sent to service centre', COMPANY_HOME_MAINTENANCE: 'Service centre home visit', WAITING_FOR_PART: 'Waiting for part', WAITING_CUSTOMER_APPROVAL: 'Waiting for customer approval', READY_FOR_PICKUP: 'Ready for pickup', DELIVERED_TO_CUSTOMER: 'Returned to customer', PRODUCT_EXCHANGE: 'Replaced with new unit', CANCELLED: 'Cancelled', NOT_REPAIRABLE: 'Not repairable' };
export const ROUTING_LABELS: Record<ServiceRoutingDecision, string> = { WORKSHOP: 'Our workshop', COMPANY: 'Service centre (manufacturer)', CUSTOMER_DECISION: 'Waiting on customer decision', NOT_REPAIRABLE: 'Not repairable' };
export const WARRANTY_LABELS: Record<WarrantyStatus, string> = { UNDER_WARRANTY: 'Under warranty', NO_WARRANTY: 'Out of warranty (paid repair)', UNKNOWN: 'Warranty not checked' };

/** The usual path of a warranty repair, used for the progress tracker on a job. */
export const SERVICE_PROGRESS_STEPS: Array<{ label: string; statuses: ServiceJobStatus[] }> = [
  { label: 'Received', statuses: ['RECEIVED', 'INSPECTION_PENDING'] },
  { label: 'In repair', statuses: ['IN_WORKSHOP_REPAIR', 'SENT_TO_COMPANY', 'COMPANY_HOME_MAINTENANCE', 'WAITING_FOR_PART', 'WAITING_CUSTOMER_APPROVAL'] },
  { label: 'Ready for pickup', statuses: ['READY_FOR_PICKUP'] },
  { label: 'Closed', statuses: ['DELIVERED_TO_CUSTOMER', 'PRODUCT_EXCHANGE', 'NOT_REPAIRABLE', 'CANCELLED'] },
];
