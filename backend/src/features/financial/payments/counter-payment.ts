import { Currency, PaymentMethod, Prisma } from '@prisma/client';
import { ValidationError } from '../../../lib/errors';
import { businessDateToPrisma } from '../domain/business-date';
import { assertPositiveMoney, toBaseAmount } from '../domain/money';
import { PaymentsRepository } from './payments.repository';

export async function recordCounterPayment(tx: Prisma.TransactionClient, input: {
  sale: { id: string; orderNumber: string; customerId: string | null; currency: Currency; exchangeRate: Prisma.Decimal };
  customerId: string | null; amount: string; paymentDate: string; idempotencyKey: string;
  fingerprint: string; snapshot: Prisma.InputJsonObject; userId: string;
}) {
  if (input.customerId !== input.sale.customerId) throw new ValidationError('Payment customer must match the source sale');
  const totalAmount = assertPositiveMoney(input.amount, input.sale.currency);
  return PaymentsRepository.createCounterReceipt(tx, {
    customerId: input.customerId, salesOrderId: input.sale.id, totalAmount,
    currency: input.sale.currency, exchangeRate: input.sale.exchangeRate,
    baseAmount: toBaseAmount(totalAmount, input.sale.currency, input.sale.exchangeRate, Prisma.Decimal.ROUND_HALF_UP),
    paymentDate: businessDateToPrisma(input.paymentDate), paymentMethod: PaymentMethod.CASH,
    reference: input.sale.orderNumber, sourceSnapshot: input.snapshot,
    idempotencyKey: input.idempotencyKey, idempotencyFingerprint: input.fingerprint, createdById: input.userId,
  });
}
