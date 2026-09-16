import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { CustomerForm, customerSchema } from './CustomerForm';

describe('customer form Arabic text support', () => {
  it('accepts blank, zero, and USD limits but rejects negative/fractional precision limits', () => {
    for (const creditLimit of ['', '0', '100.00']) expect(customerSchema.safeParse({ name: 'Ali', phone: '03000000', creditLimit }).success).toBe(true);
    for (const creditLimit of ['-1', '1.001', '10000000000']) expect(customerSchema.safeParse({ name: 'Ali', phone: '03000000', creditLimit }).success).toBe(false);
    const html = renderToStaticMarkup(<CustomerForm canManageCreditLimit initialData={{ name: 'Ali', phone: '03000000', creditLimit: '100.00' }} onSubmit={vi.fn()} onCancel={vi.fn()} />);
    expect(html).toContain('Credit limit (USD) / حد الائتمان بالدولار');
    expect(html).toContain('name="creditLimit"');
  });
  it('renders customer text inputs with automatic text direction', () => {
    const html = renderToStaticMarkup(
      <CustomerForm
        initialData={{
          name: 'علي الحاج',
          phone: '03000000',
          address: 'شارع الحمرا',
          notes: 'ملاحظة عربية',
        }}
        onSubmit={vi.fn()}
        onCancel={vi.fn()}
      />
    );

    expect(html.match(/dir="auto"/g)?.length).toBeGreaterThanOrEqual(3);
    expect(html).toContain('user-text-input');
    expect(html).toContain('Customer Name / اسم الزبون');
    expect(html).toContain('Phone / رقم الهاتف');
    expect(html).toContain('Save Customer / حفظ الزبون');
  });

  it('uses bilingual required-field messages for customer identity fields', () => {
    const result = customerSchema.safeParse({ name: '', phone: '', address: '', notes: '' });

    expect(result.success).toBe(false);
    if (!result.success) {
      const messages = result.error.issues.map((issue) => issue.message);
      expect(messages).toContain('Customer name is required / اسم الزبون مطلوب');
      expect(messages).toContain('Phone is required / رقم الهاتف مطلوب');
    }
  });
});


it('does not expose credit-limit configuration to an employee', () => {
  const html = renderToStaticMarkup(<CustomerForm initialData={{ name: 'Ali', phone: '03000000', creditLimit: '100.00' }} onSubmit={vi.fn()} onCancel={vi.fn()} />);
  expect(html).not.toContain('name="creditLimit"');
});
