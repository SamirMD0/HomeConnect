import axios from 'axios';
import type { Product } from '../../products/types/product.types';
import type { CreateSalesOrderInput } from '../types/sales-orders.types';
import {
  compareMoney,
  isPositiveMoney,
  normalizeMoney,
  scaleMoney,
  subtractMoney,
} from './sales-money';

export type QuickOrderPaymentMode = 'PAID' | 'PARTIAL' | 'DEBT';

export interface QuickOrderFormState {
  quantity: number;
  unitPrice: string;
  paymentMode: QuickOrderPaymentMode;
  partialAmount: string;
  debtDueDate: string;
  customerId: string;
  notes: string;
}

export type QuickOrderErrors = Partial<Record<keyof QuickOrderFormState, string>>;

export function productSellingPrice(product: Product): string {
  return product.pricing?.pricingAvailable
    ? product.pricing.cashPrice
    : product.netPrice ?? product.price ?? '0.00';
}

export function initialQuickOrderState(product: Product): QuickOrderFormState {
  return {
    quantity: 1,
    unitPrice: productSellingPrice(product),
    paymentMode: 'PAID',
    partialAmount: '',
    debtDueDate: '',
    customerId: '',
    notes: '',
  };
}

export function quickOrderTotals(state: QuickOrderFormState) {
  const lineTotal = scaleMoney(state.unitPrice, state.quantity);
  const total = lineTotal;
  const paidAmount = state.paymentMode === 'PAID'
    ? total
    : state.paymentMode === 'DEBT'
      ? '0.00'
      : normalizeMoney(state.partialAmount);
  return {
    lineTotal,
    total,
    paidAmount,
    remaining: subtractMoney(total, paidAmount),
  };
}

export function quickOrderCustomerOptional(state: QuickOrderFormState, isAdmin: boolean): boolean {
  return isAdmin && quickOrderTotals(state).remaining === '0.00';
}

export function validateQuickOrder(
  state: QuickOrderFormState,
  context: { isAdmin: boolean; today: string }
): QuickOrderErrors {
  const errors: QuickOrderErrors = {};
  const totals = quickOrderTotals(state);

  if (!Number.isInteger(state.quantity) || state.quantity < 1 || state.quantity > 999) {
    errors.quantity = 'Quantity must be a whole number from 1 to 999 / يجب أن تكون الكمية عددًا صحيحًا من 1 إلى 999';
  }
  if (!isPositiveMoney(state.unitPrice)) {
    errors.unitPrice = 'Unit price must be greater than zero / يجب أن يكون سعر الوحدة أكبر من صفر';
  }
  if (state.paymentMode === 'PARTIAL'
      && (!isPositiveMoney(state.partialAmount) || compareMoney(state.partialAmount, totals.total) >= 0)) {
    errors.partialAmount = 'Partial payment must be greater than zero and less than the total / يجب أن تكون الدفعة الجزئية أكبر من صفر وأقل من الإجمالي';
  }

  if (totals.remaining !== '0.00') {
    if (!state.debtDueDate) {
      errors.debtDueDate = 'Debt due date is required when a balance remains / تاريخ استحقاق الدين مطلوب عند بقاء رصيد';
    } else if (state.debtDueDate < context.today) {
      errors.debtDueDate = 'Debt due date cannot be before the order date / لا يمكن أن يسبق تاريخ استحقاق الدين تاريخ الطلب';
    }
  }

  if (!quickOrderCustomerOptional(state, context.isAdmin) && !state.customerId) {
    errors.customerId = totals.remaining !== '0.00'
      ? 'Choose a customer for an order with a remaining balance / اختر زبونًا للطلب الذي يتبقى عليه رصيد'
      : 'Employees must choose a customer for every sales order / يجب على الموظف اختيار زبون لكل طلب بيع';
  }

  return errors;
}

export function buildQuickOrderPayload(input: {
  productId: string;
  state: QuickOrderFormState;
  today: string;
}): CreateSalesOrderInput {
  const { paidAmount } = quickOrderTotals(input.state);
  return {
    customerId: input.state.customerId || null,
    salesChannel: 'SHOP_DIRECT',
    orderDate: input.today,
    fulfillmentStatus: 'DELIVERED',
    paidAmount,
    debtDueDate: input.state.paymentMode === 'PAID' ? null : input.state.debtDueDate || null,
    notes: input.state.notes.trim() || null,
    items: [{
      productId: input.productId,
      quantity: input.state.quantity,
      unitPrice: normalizeMoney(input.state.unitPrice),
    }],
  };
}

export function quickOrderStockAdvice(product: Product, quantity: number): {
  tone: 'warning' | 'info';
  label: string;
  overSelling: boolean;
} {
  if (!product.trackStock) {
    return { tone: 'info', label: 'Stock not tracked / المخزون غير متتبع', overSelling: false };
  }
  if (quantity > product.stockQuantity) {
    return {
      tone: 'warning',
      label: `${product.stockQuantity} in stock · selling above stock is allowed / ${product.stockQuantity} في المخزون · البيع فوق المخزون مسموح`,
      overSelling: true,
    };
  }
  return {
    tone: 'info',
    label: `${product.stockQuantity} in stock / ${product.stockQuantity} في المخزون`,
    overSelling: false,
  };
}

export const quickOrderErrorMessage = (error: unknown): string => axios.isAxiosError(error)
  ? error.response?.data?.error?.message
    ?? error.response?.data?.message
    ?? 'Unable to create sales order / تعذر إنشاء طلب البيع'
  : 'Unable to create sales order / تعذر إنشاء طلب البيع';
