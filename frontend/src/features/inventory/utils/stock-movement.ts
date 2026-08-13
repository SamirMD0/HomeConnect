import type { WiredStockMovementType } from '../types/inventory.types';

export const movementLabels: Record<WiredStockMovementType, string> = {
  MANUAL_ADD: 'Add stock / إضافة مخزون',
  MANUAL_REMOVE: 'Remove stock / إزالة مخزون',
  STOCK_COUNT: 'Correct stock count / تصحيح الجرد',
  DAMAGE_LOSS: 'Damage or loss / تلف أو فقدان',
  RETURN_TO_STOCK: 'Return to stock / إعادة إلى المخزون',
};

export const guardedMovementTypes: WiredStockMovementType[] = ['MANUAL_REMOVE', 'STOCK_COUNT', 'DAMAGE_LOSS'];

export function movementAfter(type: WiredStockMovementType, before: number, quantity: number): number {
  if (type === 'STOCK_COUNT') return quantity;
  if (type === 'MANUAL_REMOVE' || type === 'DAMAGE_LOSS') return before - quantity;
  return before + quantity;
}

export function validateMovementForm(type: WiredStockMovementType, quantity: number, reason: string, accountPassword: string): Record<string, string> {
  const errors: Record<string, string> = {};
  if (!Number.isInteger(quantity) || quantity < 0 || (type !== 'STOCK_COUNT' && quantity === 0)) errors.quantity = 'Enter a valid whole quantity / أدخل كمية صحيحة';
  if (!reason.trim()) errors.reason = 'Reason is required / السبب مطلوب';
  if (guardedMovementTypes.includes(type) && !accountPassword) errors.accountPassword = 'Account password is required / كلمة مرور الحساب مطلوبة';
  return errors;
}
