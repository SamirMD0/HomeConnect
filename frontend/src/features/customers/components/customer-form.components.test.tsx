import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { CustomerForm } from './CustomerForm';

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
  });
});
