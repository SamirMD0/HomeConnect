import type { OrderForm, OrderPayload, PaymentForm, PaymentPayload } from './contracts';
import { localDate, validDateRange } from '../lookup/filters';
const dateValid = (date: string) => validDateRange({ from: date, to: date });
export function decimalInput(value: string): string {
  const normalized = value.trim().replace(/,/g, '');
  if (!/^(?:0|[1-9]\d*)(?:\.\d{1,2})?$/.test(normalized))
    throw new Error('Enter an amount with up to two decimal places.');
  return normalized.includes('.')
    ? normalized.padEnd(normalized.indexOf('.') + 3, '0')
    : `${normalized}.00`;
}
export function initialOrder(): OrderForm {
  return {
    customerId: '',
    customerName: '',
    currency: 'USD',
    salesChannel: 'SHOP_DIRECT',
    orderDate: localDate(),
    paidAmount: '0.00',
    debtDueDate: '',
    deliveryDate: '',
    deliveryFee: '0.00',
    deliveryTaxTreatment: 'STANDARD',
    deliveryAddress: '',
    deliveryNotes: '',
    items: [],
    newCustomer: { name: '', phone: '', address: '', notes: '' },
  };
}
export function initialPayment(customerId: string): PaymentForm {
  return {
    customerId,
    customerName: '',
    targetType: 'DEBT',
    targetId: '',
    targetDescription: '',
    amount: '',
    paymentDate: localDate(),
    paymentMethod: 'CASH',
    reference: '',
    notes: '',
  };
}
/** Mirrors CreateSalesOrderDialog's input, without deriving tax or a total. */
export function buildOrderPayload(
  form: OrderForm,
  idempotencyKey: string,
  draft: boolean
): OrderPayload {
  if (!form.customerId) throw new Error('Choose a customer.');
  if (!dateValid(form.orderDate)) throw new Error('Enter a valid order date as YYYY-MM-DD.');
  if (!form.items.length || form.items.length > 50)
    throw new Error('Add between 1 and 50 product lines.');
  const paidAmount = decimalInput(form.paidAmount);
  const items = form.items.map((line) => {
    const quantity = Number(line.quantity),
      unitPrice = decimalInput(line.unitPrice),
      discountAmount = decimalInput(line.discountAmount);
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > 999)
      throw new Error('Quantity must be a whole number from 1 to 999.');
    if (/^0\.00$/.test(unitPrice)) throw new Error('Unit price must be greater than zero.');
    if (form.currency === 'LBP' && [unitPrice, discountAmount].some((v) => !v.endsWith('.00')))
      throw new Error('LBP amounts must be whole numbers.');
    return {
      productId: line.productId,
      manualProductName: null,
      manualProductModel: null,
      quantity,
      unitPrice,
      discountAmount,
    };
  });
  if (
    !draft &&
    form.debtDueDate &&
    (!dateValid(form.debtDueDate) || form.debtDueDate < form.orderDate)
  )
    throw new Error('Set a valid debt due date on or after the order date.');
  if (form.currency === 'LBP' && !paidAmount.endsWith('.00'))
    throw new Error('LBP amounts must be whole numbers.');
  if (
    form.salesChannel !== 'SHOP_DIRECT' &&
    form.deliveryDate &&
    (!dateValid(form.deliveryDate) || form.deliveryDate < form.orderDate)
  )
    throw new Error('Delivery date must be on or after the order date.');
  return {
    idempotencyKey,
    currency: form.currency,
    customerId: form.customerId || null,
    salesChannel: form.salesChannel,
    orderDate: form.orderDate,
    fulfillmentStatus: draft
      ? 'DRAFT'
      : form.salesChannel === 'SHOP_DIRECT'
        ? 'DELIVERED'
        : 'CONFIRMED',
    paidAmount,
    debtDueDate: draft ? null : form.debtDueDate || null,
    items,
    ...(form.salesChannel !== 'SHOP_DIRECT'
      ? {
          deliveryDate: form.deliveryDate || null,
          deliveryFee: decimalInput(form.deliveryFee),
          deliveryTaxTreatment: form.deliveryTaxTreatment,
          deliveryAddressSnapshot: form.deliveryAddress || null,
          deliveryNotes: form.deliveryNotes || null,
        }
      : {}),
  };
}
/** AccountsReceivablePage -> RecordDebt/PlanPaymentDialog: USD; allocation belongs to the selected obligation. */
export function buildPaymentPayload(form: PaymentForm, idempotencyKey: string): PaymentPayload {
  if (!form.targetId) throw new Error('Choose an unpaid debt or installment plan.');
  const amount = decimalInput(form.amount);
  if (amount === '0.00') throw new Error('Payment amount must be greater than zero.');
  if (!dateValid(form.paymentDate)) throw new Error('Enter a valid payment date as YYYY-MM-DD.');
  return {
    amount,
    paymentDate: form.paymentDate,
    paymentMethod: form.paymentMethod,
    reference: form.reference.trim() || null,
    notes: form.notes.trim() || null,
    idempotencyKey,
  };
}
export function buildCustomerPayload(form: OrderForm['newCustomer']) {
  if (form.name.trim().length < 2 || form.name.length > 100)
    throw new Error('Customer name must contain 2–100 characters.');
  if (form.phone.trim().length < 5 || form.phone.length > 20)
    throw new Error('Phone must contain 5–20 characters.');
  if (form.address.length > 255) throw new Error('Address must contain at most 255 characters.');
  return {
    name: form.name.trim(),
    phone: form.phone.trim(),
    address: form.address,
    notes: form.notes,
  };
}
