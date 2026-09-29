import type { SalesOrderItem } from '../types/sales-orders.types';
import { shiftDays, todayString } from './sales-order-dates';

/**
 * Mirrors the server's fulfillment-coverage rule so the dialog can explain a
 * blocked line instead of posting a return the server must reject. The server
 * remains the authority; this only prevents a guaranteed 409.
 */
export function returnLineBlocker(item: SalesOrderItem): string | null {
  if (!item.product?.trackStock) return null;
  const active = (item.stockFulfillments ?? []).filter((record) => record.status === 'ACTIVE');
  const alreadyReturned = item.returnedQuantity ?? 0;
  if (active.length !== 1 || active[0].quantity <= alreadyReturned) {
    return 'Stock was never deducted for this line — use Deduct Stock on this order first / لم يتم إخراج المخزون لهذا السطر — استخدم إخراج من المخزون أولاً';
  }
  return null;
}

/** The window is open through orderDate + windowDays, matching the server's business-date comparison. */
export function isReturnWindowExpired(orderDate: string, windowDays: number | undefined, today = todayString()): boolean {
  if (windowDays === undefined) return false;
  return today > shiftDays(orderDate.slice(0, 10), windowDays);
}

export function returnSubmitProblem(form: {
  selectedQuantity: number;
  reason: string;
  password: string;
  override: boolean;
  overrideReason: string;
}): string | null {
  if (form.selectedQuantity <= 0) return 'Enter a return quantity for at least one line / أدخل كمية إرجاع لسطر واحد على الأقل';
  if (!form.reason.trim()) return 'Enter a return reason / أدخل سبب الإرجاع';
  if (form.override && !form.overrideReason.trim()) return 'Enter the override reason / أدخل سبب التجاوز';
  if (!form.password) return 'Enter your account password / أدخل كلمة مرور الحساب';
  return null;
}
