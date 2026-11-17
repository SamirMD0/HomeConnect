import { describe, expect, it } from 'vitest';
import { memoryDb } from './testing/memory-db';
import { saveAction, type ActionType } from './outbox';
import { OutboxSender } from './outbox-sender';
import {
  customerPaymentAction,
  supplierBillAction,
  supplierPaymentAction,
} from './action-payloads';
import {
  buildOrderPayload,
  buildPaymentPayload,
  initialOrder,
  initialPayment,
} from '../sales/payloads';
describe('the four Phase 3 action envelopes', () => {
  it('uses the LAN builders unchanged and adds only the URL routing identifiers', async () => {
    const db = await memoryDb(),
      id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
    const order = buildOrderPayload(
      {
        ...initialOrder(),
        customerId: 'customer',
        items: [
          {
            productId: 'p',
            name: 'Fan',
            sku: 'F',
            quantity: '1',
            unitPrice: '12.00',
            discountAmount: '0.00',
          },
        ],
      },
      id,
      false
    );
    const payment = buildPaymentPayload(
      { ...initialPayment('customer'), targetId: 'debt', amount: '120.50' },
      id
    );
    const supplierInput = {
      supplierId: 'supplier',
      amount: 120.5,
      currency: 'USD' as const,
      paymentMethod: 'CASH_USD' as const,
      occurredAt: '2026-11-17',
      note: ' Paid ',
    };
    const expected: [ActionType, Record<string, unknown>][] = [
      ['sales_order.create', { ...order }],
      ['customer_payment.create', { targetType: 'DEBT', targetId: 'debt', ...payment }],
      [
        'supplier_payment.create',
        {
          supplierId: 'supplier',
          type: 'SUPPLIER_PAYMENT',
          amount: '120.50',
          currency: 'USD',
          paymentMethod: 'CASH_USD',
          transactionDate: '2026-11-17',
          description: 'Supplier payment',
          notes: 'Paid',
        },
      ],
      ['supplier_bill.upload', { supplierId: 'supplier', note: 'Bill' }],
    ];
    const actual = [
      order,
      customerPaymentAction({ targetType: 'DEBT', targetId: 'debt' }, payment),
      supplierPaymentAction(supplierInput),
      supplierBillAction('supplier', ' Bill '),
    ];
    for (let index = 0; index < expected.length; index++) {
      await saveAction(
        db,
        {
          owner: 'phone:user',
          submissionKey: String(index),
          type: expected[index]![0],
          branchId: 'branch',
          payload: { ...actual[index] },
          summary: 'Fixture',
          ...(index === 3 ? { photo: { uri: 'cache', mime: 'image/jpeg' } } : {}),
        },
        {
          uuid: () => (index < 2 ? id : id.slice(0, -1) + index),
          files: {
            copy: async () => ({ path: 'document', size: 5 }),
            read: async () => new Blob(['photo']),
            remove: async () => {},
          },
        }
      );
      // Each order/payment has a different owner in reality; clear the previous row after verifying its wire envelope.
      const sent: any[] = [];
      await new OutboxSender(
        db,
        'phone:user',
        async (path, init) => {
          if (init?.method === 'POST') {
            sent.push(JSON.parse(String(init.body)));
            return { status: index === 3 ? 'awaiting_photo' : 'pending' };
          }
          if (init?.method === 'PUT') return { id: 'bill', size: 5 };
          return [];
        },
        {
          files: {
            copy: async () => ({ path: 'document', size: 5 }),
            read: async () => new Blob(['photo']),
            remove: async () => {},
          },
        }
      ).sync();
      expect(sent).toEqual([
        {
          id: index < 2 ? id : id.slice(0, -1) + index,
          type: expected[index]![0],
          branchId: 'branch',
          payload: expected[index]![1],
          createdAt: expect.any(String),
          ...(index === 3 ? { photo: { mime: 'image/jpeg', size: 5 } } : {}),
        },
      ]);
      await db.exec('DELETE FROM outbox');
    }
    expect(
      customerPaymentAction({ targetType: 'INSTALLMENT_PLAN', targetId: 'plan' }, payment)
    ).toEqual({ targetType: 'INSTALLMENT_PLAN', targetId: 'plan', ...payment });
    expect(supplierBillAction('s', undefined, 'group')).toEqual({
      supplierId: 's',
      billGroupId: 'group',
    });
    expect(
      supplierPaymentAction({ ...supplierInput, currency: 'LBP', amount: 120000 })
    ).toMatchObject({ amount: '120000' });
  });
});
