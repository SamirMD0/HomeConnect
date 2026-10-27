import { randomUUID } from 'node:crypto';
import type { Prisma } from '@prisma/client';

/** Raw inserts intentionally work on both sides of the ownership migration. */
export async function insertMigrationRow(
  tx: Prisma.TransactionClient,
  table: string,
  overrides: Record<string, unknown> = {}
) {
  if (!/^[a-z_]+$/.test(table)) throw new Error('Invalid fixture table');
  const columns = await tx.$queryRawUnsafe<
    Array<{ column_name: string; data_type: string; udt_name: string }>
  >(
    "SELECT column_name,data_type,udt_name FROM information_schema.columns WHERE table_schema='public' AND table_name=$1 AND is_nullable='NO' AND column_default IS NULL ORDER BY ordinal_position",
    table
  );
  const id = String(overrides.id ?? randomUUID());
  const values: Record<string, unknown> = {};
  for (const col of columns) {
    const key = col.column_name;
    if (key in overrides) continue;
    if (key === 'id') values[key] = id;
    else if (col.udt_name === 'uuid') throw new Error('Missing fixture FK ' + table + '.' + key);
    else if (col.data_type === 'USER-DEFINED') {
      const [v] = await tx.$queryRawUnsafe<Array<{ label: string }>>(
        'SELECT enumlabel AS label FROM pg_enum JOIN pg_type ON pg_type.oid=enumtypid WHERE typname=$1 ORDER BY enumsortorder LIMIT 1',
        col.udt_name
      );
      values[key] = v.label;
    } else if (['integer', 'smallint', 'bigint'].includes(col.data_type)) values[key] = 1;
    else if (col.data_type === 'numeric') values[key] = '10.00';
    else if (col.data_type === 'boolean') values[key] = false;
    else if (col.data_type.includes('timestamp') || col.data_type === 'date')
      values[key] = new Date('2026-08-15T10:00:00Z');
    else if (col.data_type === 'jsonb') values[key] = '{}';
    else values[key] = table + '-' + key + '-' + id;
  }
  Object.assign(values, overrides);
  const keys = Object.keys(values);
  // Explicit casts preserve NUMERIC/UUID/date values without the current Prisma model.
  const types = await tx.$queryRawUnsafe<Array<{ column_name: string; udt_name: string }>>(
    "SELECT column_name,udt_name FROM information_schema.columns WHERE table_schema='public' AND table_name=$1",
    table
  );
  const typeByKey = new Map(types.map((c) => [c.column_name, c.udt_name]));
  await tx.$executeRawUnsafe(
    'INSERT INTO "' +
      table +
      '" (' +
      keys.map((k) => '"' + k + '"').join(',') +
      ') VALUES (' +
      keys.map((k, i) => '$' + (i + 1) + '::"' + typeByKey.get(k) + '"').join(',') +
      ')',
    ...keys.map((k) => values[k])
  );
  return id;
}

export async function seedOwnershipHistory(tx: Prisma.TransactionClient) {
  const userId = await insertMigrationRow(tx, 'users', {
    username: 'branch-fixture-' + randomUUID(),
    role: 'ADMIN',
  });
  const records: Record<string, string[]> = { users: [userId] };
  const add = async (t: string, v: Record<string, unknown>) => {
    const id = await insertMigrationRow(tx, t, v);
    (records[t] ??= []).push(id);
    return id;
  };
  for (const currency of ['USD', 'LBP']) {
    const amount = currency === 'USD' ? '100.00' : '9000000.00',
      exchangeRate = currency === 'USD' ? '1' : '90000';
    const customerId = await add('customers', { createdBy: userId });
    const supplierId = await add('suppliers', { createdById: userId });
    const debtId = await add('debts', {
      customerId,
      createdById: userId,
      originalAmount: amount,
      baseOriginalAmount: '100.00',
      currency,
      exchangeRate,
    });
    const planId = await add('installment_plans', {
      customerId,
      createdById: userId,
      totalAmount: amount,
      baseTotalAmount: '100.00',
      currency,
      exchangeRate,
    });
    const installmentId = await add('installments', {
      installmentPlanId: planId,
      amountDue: amount,
      baseAmountDue: '100.00',
    });
    const salesOrderId = await add('sales_orders', {
      customerId,
      createdById: userId,
      orderDate: new Date('2026-08-15'),
      currency,
      exchangeRate,
      totalAmount: amount,
      baseTotalAmount: '100.00',
      paidAmount: '0.00',
      basePaidAmount: '0.00',
      remainingAmount: amount,
      baseRemainingAmount: '100.00',
      fulfillmentStatus: 'CONFIRMED',
    });
    await add('sales_orders', {
      createdById: userId,
      currency,
      exchangeRate,
      fulfillmentStatus: 'CONFIRMED',
    });
    const paymentId = await add('payments', {
      customerId,
      createdById: userId,
      totalAmount: currency === 'USD' ? '20.00' : '1800000.00',
      baseAmount: '20.00',
      currency,
      exchangeRate,
    });
    await add('payment_allocations', {
      paymentId,
      debtId,
      amount: currency === 'USD' ? '10.00' : '900000.00',
      paymentAmount: currency === 'USD' ? '10.00' : '900000.00',
      exchangeRate,
    });
    await add('payment_allocations', {
      paymentId,
      installmentId,
      amount: currency === 'USD' ? '10.00' : '900000.00',
      paymentAmount: currency === 'USD' ? '10.00' : '900000.00',
      exchangeRate,
    });
    for (const [sequence, refundMethod] of [
      [1, 'CASH_OUT'],
      [2, 'STORE_CREDIT'],
    ] as const) {
      const salesReturnId = await add('sales_returns', {
        salesOrderId,
        customerId,
        processedById: userId,
        currency,
        exchangeRate,
        sequence,
        refundMethod,
        totalIncVat: currency === 'USD' ? '20.00' : '1800000.00',
        baseTotalIncVat: '20.00',
        receivableReliefAmount: currency === 'USD' ? '1.00' : '90000.00',
        baseReceivableReliefAmount: '1.00',
        refundableAmount: currency === 'USD' ? '19.00' : '1710000.00',
        baseRefundableAmount: '19.00',
        returnDate: new Date('2026-08-16'),
        returnDeadlineSnapshot: new Date('2026-08-29'),
      });
      await add('sales_return_receivable_allocations', {
        salesReturnId,
        debtId,
        amount: currency === 'USD' ? '1.00' : '90000.00',
        baseAmount: '1.00',
        exchangeRate,
      });
      if (refundMethod === 'CASH_OUT')
        await add('cash_refunds', {
          salesReturnId,
          customerId,
          processedById: userId,
          currency,
          exchangeRate,
        });
      else
        await add('customer_credits', {
          salesReturnId,
          customerId,
          issuedById: userId,
          currency,
          exchangeRate,
        });
    }
    await add('supplier_transactions', {
      supplierId,
      createdById: userId,
      currency,
      exchangeRate,
      amount,
      baseAmount: '100.00',
    });
    await add('supplier_receivings', { supplierId, receivedById: userId });
    await add('supplier_receivings', { receivedById: userId });
    await add('service_jobs', {
      customerId,
      createdById: userId,
      serviceCreatedDate: new Date('2026-08-15'),
    });
  }
  return { userId, records };
}
