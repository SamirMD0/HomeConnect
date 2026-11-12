import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { URL as NodeURL } from 'node:url';
import ts from 'typescript';
import {
  buildCustomerPayload,
  buildOrderPayload,
  buildPaymentPayload,
  initialOrder,
  initialPayment,
} from './payloads';
import { DraftStore, type DraftStorage } from './draft-store';
import { paymentReceiptHtml } from './receipt-html';
import { syntheticBusiness, syntheticReceipt } from './synthetic';
import { can } from '../permissions/can';
import { exportPaymentReceipt } from './receipt-export';

const source = (path: string) =>
  readFileSync(new NodeURL(`../../../frontend/src/${path}`, import.meta.url), 'utf8');
const desktopMoney = { exports: {} as { canonicalMoneyInput: (value: string) => string } };
new Function(
  'module',
  'exports',
  ts.transpileModule(source('features/customer-financial/utils/money-input.ts'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS },
  }).outputText
)(desktopMoney, desktopMoney.exports);
const canonicalMoneyInput = desktopMoney.exports.canonicalMoneyInput;
/** Evaluate only the actual desktop request object, with synthetic form variables. */
function desktopObject(
  file: string,
  match: (node: ts.Node) => ts.Node | undefined,
  context: object
): unknown {
  const code = source(file),
    ast = ts.createSourceFile(file, code, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let expression: ts.Node | undefined;
  const visit = (node: ts.Node) => {
    expression ??= match(node);
    if (!expression) ts.forEachChild(node, visit);
  };
  visit(ast);
  if (!expression) throw new Error('Desktop request object was not found');
  return new Function(...Object.keys(context), `return (${expression.getText(ast)});`)(
    ...Object.values(context)
  );
}
const key = 'f680f926-c96c-46b7-8fb1-0c16742d1ab1';
const orderForm = () => ({
  ...initialOrder(),
  customerId: 'customer',
  customerName: 'Fixture Customer',
  orderDate: '2026-11-12',
  debtDueDate: '2026-12-12',
  paidAmount: '25.50',
  items: [
    {
      productId: 'product',
      name: 'Fixture drill',
      sku: 'QA-DRILL',
      quantity: '2',
      unitPrice: '139.00',
      discountAmount: '0.00',
    },
  ],
});
describe('desktop payload parity', () => {
  it.each(['SHOP_DIRECT', 'SHOP_DELIVERY', 'PHONE_ORDER'] as const)(
    'matches CreateSalesOrderDialog for %s, draft and confirmation',
    (channel) => {
      const form = {
        ...orderForm(),
        salesChannel: channel,
        deliveryDate: '2026-11-15',
        deliveryFee: '5.00',
        deliveryAddress: 'Fixture address',
        deliveryNotes: 'QA only',
      };
      for (const draft of [false, true]) {
        const actual = buildOrderPayload(form, key, draft);
        const items = [
          {
            productId: 'product',
            manualProductName: null,
            manualProductModel: null,
            quantity: 2,
            unitPrice: '139.00',
            discountAmount: '0.00',
          },
        ];
        const expected = desktopObject(
          'features/sales-orders/components/CreateSalesOrderDialog.tsx',
          (node) =>
            ts.isVariableDeclaration(node) && node.name.getText() === 'input'
              ? node.initializer
              : undefined,
          {
            credit: { payload: {} },
            receiptKey: { current: key },
            currency: 'USD',
            customerId: 'customer',
            channel,
            today: () => '2026-11-12',
            fulfillmentStatus: draft
              ? 'DRAFT'
              : channel === 'SHOP_DIRECT'
                ? 'DELIVERED'
                : 'CONFIRMED',
            paidAmount: '25.50',
            debtDueDate: '2026-12-12',
            paymentMode: 'PARTIAL',
            items,
            deliveryDate: form.deliveryDate,
            deliveryFee: form.deliveryFee,
            deliveryTaxTreatment: 'STANDARD',
            deliveryAddress: form.deliveryAddress,
            deliveryNotes: form.deliveryNotes,
          }
        );
        expect(actual).toEqual(expected);
        expect(actual).not.toHaveProperty('totalAmount');
        expect(actual).not.toHaveProperty('vatAmount');
      }
    }
  );
  it.each(['RecordDebtPaymentDialog', 'RecordPlanPaymentDialog'])(
    'matches %s exactly, including omitted currency/allocation fields',
    (dialog) => {
      const form = {
        ...initialPayment('customer'),
        targetId: 'debt',
        amount: '25.5',
        paymentDate: '2026-11-12',
        reference: ' QA-1 ',
        notes: '  ',
      };
      const expected = desktopObject(
        `features/customer-financial/components/${dialog}.tsx`,
        (node) =>
          ts.isCallExpression(node) && node.expression.getText() === 'recordPayment.mutateAsync'
            ? node.arguments[0]
            : undefined,
        { values: form, canonicalMoneyInput, idempotencyKey: key }
      );
      expect(buildPaymentPayload(form, key)).toEqual(expected);
      expect(buildPaymentPayload(form, key)).toMatchInlineSnapshot(`
      {
        "amount": "25.50",
        "idempotencyKey": "f680f926-c96c-46b7-8fb1-0c16742d1ab1",
        "notes": null,
        "paymentDate": "2026-11-12",
        "paymentMethod": "CASH",
        "reference": "QA-1",
      }
    `);
    }
  );
  it('uses the required desktop customer fields without mobile-only metadata', () => {
    expect(
      buildCustomerPayload({ name: 'Fixture Customer', phone: '12345', address: '', notes: '' })
    ).toEqual({ name: 'Fixture Customer', phone: '12345', address: '', notes: '' });
    expect(() =>
      buildCustomerPayload({ name: 'A', phone: '12345', address: '', notes: '' })
    ).toThrow('2–100');
  });
  it('validates quantities, dates and LBP whole amounts without deriving tax or balances', () => {
    expect(() => buildOrderPayload({ ...orderForm(), currency: 'LBP' }, key, false)).toThrow(
      'whole numbers'
    );
    expect(() =>
      buildOrderPayload({ ...orderForm(), debtDueDate: '2026-02-30' }, key, false)
    ).toThrow('due date');
    expect(
      buildOrderPayload({ ...orderForm(), debtDueDate: '' }, key, true).debtDueDate
    ).toBeNull();
    expect(() =>
      buildPaymentPayload({ ...initialPayment('c'), targetId: 'd', amount: '0' }, key)
    ).toThrow('greater than zero');
  });
});
function memory() {
  const slots = new Map<0 | 1, string>();
  const storage: DraftStorage = {
    read: async (slot) => slots.get(slot) ?? null,
    write: async (slot, value) => {
      slots.set(slot, value);
    },
  };
  return { slots, storage };
}
describe('durable submissions', () => {
  it('preserves edits and the UUID across a fresh process/store; clears both slots on explicit discard', async () => {
    const { storage, slots } = memory(),
      uuid = vi.fn(() => key);
    const first = await DraftStore.open(storage, 'pc/user/branch/order', orderForm, uuid);
    await first.edit({ ...orderForm(), paidAmount: '74.50' });
    const restarted = await DraftStore.open(storage, 'pc/user/branch/order', orderForm, uuid);
    expect(restarted.current.form?.paidAmount).toBe('74.50');
    expect(restarted.current.idempotencyKey).toBe(key);
    expect(uuid).toHaveBeenCalledOnce();
    await restarted.discard();
    expect([...slots.values()].every((value) => JSON.parse(value).form === null)).toBe(true);
    await DraftStore.open(storage, 'pc/user/branch/order', orderForm, uuid);
    expect(uuid).toHaveBeenCalledTimes(2);
  });
  it.each(['order', 'payment'])(
    'lost response + disconnected retry + restart creates exactly one %s',
    async (kind) => {
      const { storage, slots } = memory(),
        records = new Map<string, { id: string }>(),
        requests: unknown[] = [];
      const open = () =>
        DraftStore.open<
          { amount: string },
          { amount: string; idempotencyKey: string },
          { id: string }
        >(
          storage,
          `pc/u/b/${kind}`,
          () => ({ amount: '25.50' }),
          () => key
        );
      const build = (form: { amount: string }, idempotencyKey: string) => ({
        ...form,
        idempotencyKey,
      });
      const send = async (payload: { amount: string; idempotencyKey: string }) => {
        requests.push(payload);
        const record = records.get(payload.idempotencyKey) ?? { id: `${kind}-1` };
        records.set(payload.idempotencyKey, record);
        return record;
      };
      const first = await open();
      await expect(
        first.submit(build, async (payload) => {
          await send(payload);
          throw new Error('Response lost');
        })
      ).rejects.toThrow('Response lost');
      await expect(first.edit({ amount: '99.00' })).rejects.toThrow('Resolve');
      await expect(first.discard()).rejects.toThrow('already');
      const restarted = await open();
      await expect(
        restarted.submit(
          () => {
            throw new Error('Must use frozen payload');
          },
          async () => {
            throw new Error('Offline');
          }
        )
      ).rejects.toThrow('Offline');
      const third = await open();
      await expect(third.submit(build, send)).resolves.toEqual({ id: `${kind}-1` });
      expect(records.size).toBe(1);
      expect(requests).toEqual([
        { amount: '25.50', idempotencyKey: key },
        { amount: '25.50', idempotencyKey: key },
      ]);
      expect(
        [...slots.values()].every(
          (value) => JSON.parse(value).form === null && JSON.parse(value).payload === null
        )
      ).toBe(true);
      const saved = await open();
      await saved.submit(build, send);
      expect(requests).toHaveLength(2);
    }
  );
  it('single-flights concurrent taps and never sends before verified persistence', async () => {
    const { storage } = memory();
    const store = await DraftStore.open<{ amount: string }, object, object>(
      storage,
      'scope',
      () => ({ amount: '1.00' }),
      () => key
    );
    const send = vi.fn(async () => ({ id: 'one' })),
      build = (form: { amount: string }) => form;
    await Promise.all([store.submit(build, send), store.submit(build, send)]);
    expect(send).toHaveBeenCalledOnce();
    const failing = await DraftStore.open<{ amount: string }, object, object>(
      storage,
      'scope',
      () => ({ amount: '1.00' }),
      () => key
    );
    await failing.discard();
    const fresh = await DraftStore.open<{ amount: string }, object, object>(
      storage,
      'scope',
      () => ({ amount: '1.00' }),
      () => key
    );
    storage.write = async () => {
      throw new Error('Disk full');
    };
    await expect(fresh.submit(build, send)).rejects.toThrow('Disk full');
    expect(send).toHaveBeenCalledOnce();
  });
  it('recovers a partial write and refuses entirely corrupt or wrong-scope storage', async () => {
    const { storage, slots } = memory();
    const store = await DraftStore.open(storage, 'scope', orderForm, () => key);
    await store.edit(orderForm());
    slots.set((store.current.revision % 2) as 0 | 1, '{partial');
    expect(
      (await DraftStore.open(storage, 'scope', orderForm, () => 'new-key')).current.idempotencyKey
    ).toBe(key);
    await expect(
      DraftStore.open(storage, 'different-scope', orderForm, () => 'new-key')
    ).rejects.toThrow('could not be read');
    slots.set(0, '{partial');
    slots.set(1, '{partial');
    await expect(DraftStore.open(storage, 'scope', orderForm, () => 'new-key')).rejects.toThrow(
      'could not be read'
    );
  });
});
describe('permissions and receipt document', () => {
  it('prints receipt HTML and opens the native file share API with the PDF URI and MIME', async () => {
    const native = {
      isAvailableAsync: vi.fn().mockResolvedValue(true),
      printToFileAsync: vi.fn().mockResolvedValue({ uri: 'file:///cache/receipt.pdf' }),
      shareAsync: vi.fn().mockResolvedValue(undefined),
    };
    await exportPaymentReceipt(syntheticReceipt, syntheticBusiness, native);
    expect(native.printToFileAsync).toHaveBeenCalledWith(
      expect.objectContaining({ html: expect.stringContaining('PAYMENT RECEIPT') })
    );
    expect(native.shareAsync).toHaveBeenCalledWith('file:///cache/receipt.pdf', {
      mimeType: 'application/pdf',
      UTI: '.pdf',
      dialogTitle: 'Share payment receipt',
    });
    native.isAvailableAsync.mockResolvedValue(false);
    await expect(exportPaymentReceipt(syntheticReceipt, syntheticBusiness, native)).rejects.toThrow(
      'unavailable'
    );
    expect(native.shareAsync).toHaveBeenCalledOnce();
  });
  it.each(['ADMIN', 'EMPLOYEE', 'UNKNOWN'])(
    'mirrors sales and receivables permissions for %s',
    (role) => {
      expect(can('orders.create', { role })).toBe(role !== 'UNKNOWN');
      expect(can('customers.create', { role })).toBe(role !== 'UNKNOWN');
      expect(can('payments.create', { role })).toBe(role === 'ADMIN');
      expect(can('payments.create', null)).toBe(false);
    }
  );
  it('renders server amounts/allocation/balance with escaped text and no remote resources', () => {
    const html = paymentReceiptHtml(
      { ...syntheticReceipt, notes: '<script>alert("x")</script>' },
      syntheticBusiness
    );
    expect(html).toContain('$25.50');
    expect(html).toContain('$100.00');
    expect(html).toContain('12/11/2026');
    expect(html).toContain('Fixture branch A');
    expect(html).toContain('&lt;script&gt;');
    expect(html).not.toContain('<script>');
    expect(html).not.toMatch(/(?:src|href)=/);
    expect(html).not.toContain('Authorization');
  });
  it('marks voided receipts and preserves large USD and LBP values without Number conversion', () => {
    const html = paymentReceiptHtml(
      {
        ...syntheticReceipt,
        totalAmount: '9007199254740993.25',
        voidedAt: '2026-11-12T09:00:00Z',
        voidReason: 'Synthetic void',
        remainingBalances: [
          { ...syntheticReceipt.remainingBalances[0]!, amount: '2500000', currency: 'LBP' },
        ],
      },
      syntheticBusiness
    );
    expect(html).toContain('VOID');
    expect(html).toContain('Synthetic void');
    expect(html).toContain('$9,007,199,254,740,993.25');
    expect(html).toContain('2,500,000 LBP');
  });
});
