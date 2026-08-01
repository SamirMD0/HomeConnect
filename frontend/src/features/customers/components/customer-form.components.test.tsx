import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { CustomerForm, customerSchema } from './CustomerForm';

describe('customer form Arabic text support', () => {
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
