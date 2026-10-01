#!/usr/bin/env tsx
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcrypt';

const username = 'smoke-admin@example.test';
const password = 'smoke-admin-password-NOT-REAL';
const id = (number: number) => `60000000-0000-4000-8000-${String(number).padStart(12, '0')}`;
const money = (amount: number) => amount.toFixed(2);

function argument(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function validateFixtureUrl(value: string | undefined): string {
  if (!value) throw new Error('A disposable database URL is required.');
  const url = new URL(value);
  const databaseName = decodeURIComponent(url.pathname.slice(1));
  if (!['postgres:', 'postgresql:'].includes(url.protocol) || !/(test|drill|phase\d)/i.test(databaseName)) {
    throw new Error('Refusing a database whose name does not contain test, drill, or phase plus a number.');
  }
  return value;
}

function businessDate(value: string | undefined): Date {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error('Pass today as --business-date YYYY-MM-DD.');
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) throw new Error('Invalid business date.');
  return date;
}

function saleItem(orderId: string, productId: string, letter: string, amount: number, number: number, timestamp: Date) {
  return {
    id: id(number), salesOrderId: orderId, productId,
    productNameSnapshot: `Smoke Product ${letter}`, productModelSnapshot: `Smoke Model ${letter}`,
    skuSnapshot: `SMK-${letter}`, quantity: 1, unitPrice: money(amount), lineTotal: money(amount),
    baseUnitPrice: money(amount), baseLineTotal: money(amount), taxRateSnapshot: '0.000',
    unitPriceExVat: money(amount), vatAmount: '0.00', lineTotalIncVat: money(amount), createdAt: timestamp,
    updatedAt: timestamp,
  };
}

async function main(): Promise<void> {
  const databaseUrl = validateFixtureUrl(argument('--database-url'));
  const date = businessDate(argument('--business-date'));
  const deadline = new Date(date.getTime() + 14 * 24 * 60 * 60 * 1000);
  const timestamp = new Date(date.getTime() + 12 * 60 * 60 * 1000);
  const client = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
  try {
    const alreadyPresent = await client.$transaction(async (tx) => {
      const fixtureAdmin = await tx.user.findUnique({ where: { id: id(1) } });
      if (fixtureAdmin) {
        if (fixtureAdmin.username !== username) throw new Error('Fixture UUID is already used by another user.');
        const [customers, products, orders, payments, returns, sale] = await Promise.all([
          tx.customer.count({ where: { id: { in: [id(101), id(102), id(103)] } } }),
          tx.product.count({ where: { id: { in: [id(201), id(202), id(203), id(204), id(205)] } } }),
          tx.salesOrder.count({ where: { id: { in: [id(301), id(302)] } } }),
          tx.payment.count({ where: { id: id(601) } }),
          tx.salesReturn.count({ where: { id: id(801) } }),
          tx.salesOrder.findUnique({ where: { id: id(301) }, select: { orderDate: true } }),
        ]);
        if (customers !== 3 || products !== 5 || orders !== 2 || payments !== 1 || returns !== 1 ||
            sale?.orderDate.toISOString().slice(0, 10) !== date.toISOString().slice(0, 10)) {
          throw new Error('Existing fixture is incomplete or uses a different business date.');
        }
        return true;
      }
      const existing = await Promise.all([
        tx.customer.count(), tx.product.count(), tx.salesOrder.count(), tx.debt.count(),
        tx.payment.count(), tx.salesReturn.count(),
      ]);
      if (existing.some((count) => count !== 0)) throw new Error('Disposable database must have no existing customer, product, or sales data.');

      const hashedPassword = await bcrypt.hash(password, '$2b$12$abcdefghijklmnopqrstuu');
      await tx.user.upsert({ where: { id: id(1) }, update: {}, create: {
        id: id(1), username, password: hashedPassword, fullName: 'Smoke Administrator', role: 'ADMIN',
        createdAt: timestamp, updatedAt: timestamp,
      } });
      for (const number of [1, 2, 3]) {
        await tx.customer.upsert({ where: { id: id(100 + number) }, update: {}, create: {
          id: id(100 + number), name: `Smoke Customer ${['One', 'Two', 'Three'][number - 1]}`,
          phone: `00000000${number}`, createdBy: id(1), createdAt: timestamp, updatedAt: timestamp,
        } });
      }
      for (const [index, letter] of ['A', 'B', 'C', 'D', 'E'].entries()) {
        await tx.product.upsert({ where: { id: id(201 + index) }, update: {}, create: {
          id: id(201 + index), sku: `SMK-${letter}`, name: `Smoke Product ${letter}`,
          model: `Smoke Model ${letter}`, price: money([25, 50, 200, 40, 50][index]),
          trackStock: true, stockQuantity: (index + 1) * 10, createdById: id(1),
          createdAt: timestamp, updatedAt: timestamp,
        } });
      }
      await tx.debt.upsert({ where: { id: id(501) }, update: {}, create: {
        id: id(501), customerId: id(101), description: 'Smoke on-account sale',
        originalAmount: '200.00', baseOriginalAmount: '200.00', dueDate: deadline,
        status: 'PARTIALLY_PAID', createdById: id(1), createdAt: timestamp, updatedAt: timestamp,
      } });
      const common = { salesChannel: 'SHOP_DIRECT' as const, orderDate: date, createdById: id(1),
        createdAt: timestamp, updatedAt: timestamp };
      await tx.salesOrder.upsert({ where: { id: id(301) }, update: {}, create: {
        ...common, id: id(301), orderNumber: 'SMK-CASH-001', customerId: id(102),
        fulfillmentStatus: 'PARTIALLY_RETURNED', paymentStatus: 'PAID',
        itemsSubtotal: '75.00', totalAmount: '75.00', paidAmount: '75.00', remainingAmount: '0.00',
        baseSubtotal: '75.00', baseTotalAmount: '75.00', basePaidAmount: '75.00', baseRemainingAmount: '0.00',
      } });
      await tx.salesOrder.upsert({ where: { id: id(302) }, update: {}, create: {
        ...common, id: id(302), orderNumber: 'SMK-ACCOUNT-002', customerId: id(101), debtId: id(501),
        fulfillmentStatus: 'CONFIRMED', paymentStatus: 'PARTIALLY_PAID', settlement: 'DEBT',
        itemsSubtotal: '200.00', totalAmount: '200.00', paidAmount: '50.00', remainingAmount: '150.00',
        baseSubtotal: '200.00', baseTotalAmount: '200.00', basePaidAmount: '50.00', baseRemainingAmount: '150.00',
      } });
      for (const item of [
        saleItem(id(301), id(201), 'A', 25, 401, timestamp),
        saleItem(id(301), id(202), 'B', 50, 402, timestamp),
        saleItem(id(302), id(203), 'C', 200, 403, timestamp),
      ]) await tx.salesOrderItem.upsert({ where: { id: item.id }, update: {}, create: item });
      await tx.payment.upsert({ where: { id: id(601) }, update: {}, create: {
        id: id(601), customerId: id(101), salesOrderId: id(302), totalAmount: '50.00',
        baseAmount: '50.00', paymentDate: date, paymentMethod: 'CASH', createdById: id(1), createdAt: timestamp,
      } });
      await tx.paymentAllocation.upsert({ where: { id: id(701) }, update: {}, create: {
        id: id(701), paymentId: id(601), debtId: id(501), amount: '50.00', paymentAmount: '50.00',
        createdAt: timestamp,
      } });
      await tx.salesReturn.upsert({ where: { id: id(801) }, update: {}, create: {
        id: id(801), returnNumber: 'SMK-RETURN-001', salesOrderId: id(301), sequence: 1, customerId: id(102),
        returnDate: date, processedAt: timestamp, reason: 'Synthetic full-price return', windowDaysSnapshot: 14,
        returnDeadlineSnapshot: deadline, currency: 'USD', exchangeRate: '1.000000',
        subtotalExVat: '25.00', vatAmount: '0.00', totalIncVat: '25.00',
        baseSubtotalExVat: '25.00', baseVatAmount: '0.00', baseTotalIncVat: '25.00',
        receivableReliefAmount: '0.00', baseReceivableReliefAmount: '0.00',
        refundableAmount: '25.00', baseRefundableAmount: '25.00', refundMethod: 'NONE',
        idempotencyKey: 'phase6-smoke-return-001', requestFingerprint: 'phase6-smoke-return-v1',
        processedById: id(1), processedByName: 'Smoke Administrator', processedByUsername: username,
        createdAt: timestamp,
      } });
      await tx.salesReturnItem.upsert({ where: { id: id(802) }, update: {}, create: {
        id: id(802), salesReturnId: id(801), salesOrderItemId: id(401), productId: id(201), quantity: 1,
        productNameSnapshot: 'Smoke Product A', productModelSnapshot: 'Smoke Model A', skuSnapshot: 'SMK-A',
        soldQuantitySnapshot: 1, unitPriceSnapshot: '25.00', discountAmount: '0.00',
        subtotalExVat: '25.00', vatAmount: '0.00', totalIncVat: '25.00',
        baseSubtotalExVat: '25.00', baseVatAmount: '0.00', baseTotalIncVat: '25.00',
        taxRateSnapshot: '0.000', stockDisposition: 'QUARANTINE', createdAt: timestamp,
      } });
      return false;
    }, { timeout: 30000 });

    if (alreadyPresent) process.stdout.write('Fixture already present; no rows changed.\n');
    process.stdout.write('PASS admin user\nPASS 3 customers (1 with $150.00 outstanding)\n');
    process.stdout.write('PASS 5 products (total on-hand: 150)\nPASS 2 sales orders ($275.00 total)\n');
    process.stdout.write('PASS 1 payment ($50.00)\nPASS 1 sales return (1 unit of Smoke Product A at $25.00)\n');
    process.stdout.write('\n===== BASELINE =====\nTotal customers: 3\nProducts in stock: 5\n');
    process.stdout.write('Open sales orders: 1\nReceivable balance (USD): $150.00 ($200 sale - $50 payment)\n');
    process.stdout.write("Today's sales count: 2\n\nRandom spot-check candidates:\n");
    process.stdout.write('  Customer: Smoke Customer One / outstanding $150.00\n');
    process.stdout.write('  Product: Smoke Product A / SKU SMK-A / on-hand 10\n\n');
    process.stdout.write(`Admin credentials: ${username} / ${password}\n`);
  } finally {
    await client.$disconnect();
  }
}

void main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message.split(/\r?\n/, 1)[0] : 'Unknown error';
  process.stderr.write(`ERROR ${message}\n`);
  process.exitCode = 1;
});
