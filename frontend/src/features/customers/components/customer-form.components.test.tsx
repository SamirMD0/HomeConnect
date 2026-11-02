import { englishLabel } from '../../../shared/labels/business-labels';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { CustomerForm, customerSchema } from './CustomerForm';

describe('customer form Arabic text support', () => {
  it('accepts blank, zero, and USD limits but rejects negative/fractional precision limits', () => {
    for (const creditLimit of ['', '0', '100.00']) expect(customerSchema.safeParse({ name: 'Ali', phone: '03000000', creditLimit }).success).toBe(true);
    for (const creditLimit of ['-1', '1.001', '10000000000']) expect(customerSchema.safeParse({ name: 'Ali', phone: '03000000', creditLimit }).success).toBe(false);
    const html = renderToStaticMarkup(<CustomerForm canManageCreditLimit initialData={{ name: 'Ali', phone: '03000000', creditLimit: '100.00' }} onSubmit={vi.fn()} onCancel={vi.fn()} />);
    expect(html).toContain('Credit limit (USD)');
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
    expect(html).toContain('Customer Name');
    expect(html).toContain('Phone');
    expect(html).toContain('Save Customer');
  });

  it('keeps only the English half of a label, including one with its own slash', () => {
    expect(englishLabel('Save / حفظ')).toBe('Save');
    expect(englishLabel('Receipt / Bill No. / رقم الإيصال')).toBe('Receipt / Bill No.');
    expect(englishLabel('English only')).toBe('English only');
  });

  it('shows no Arabic of its own, while still accepting Arabic customer text', () => {
    const html = renderToStaticMarkup(<CustomerForm canManageCreditLimit onSubmit={vi.fn()} onCancel={vi.fn()} />);
    expect(html).not.toMatch(/[؀-ۿ]/);
    expect(html).toContain('dir="auto"');
  });

  it('uses English required-field messages for customer identity fields', () => {
    const result = customerSchema.safeParse({ name: '', phone: '', address: '', notes: '' });

    expect(result.success).toBe(false);
    if (!result.success) {
      const messages = result.error.issues.map((issue) => issue.message);
      expect(messages).toContain('Customer name is required');
      expect(messages).toContain('Phone is required');
    }
  });
});


it('does not expose credit-limit configuration to an employee', () => {
  const html = renderToStaticMarkup(<CustomerForm initialData={{ name: 'Ali', phone: '03000000', creditLimit: '100.00' }} onSubmit={vi.fn()} onCancel={vi.fn()} />);
  expect(html).not.toContain('name="creditLimit"');
});
