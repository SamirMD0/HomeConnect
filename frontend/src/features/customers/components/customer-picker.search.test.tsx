import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

const { useCustomersMock, useCreateCustomerMock, useCustomerSearchSuggestionsMock } = vi.hoisted(() => ({
  useCustomersMock: vi.fn(),
  useCreateCustomerMock: vi.fn(),
  useCustomerSearchSuggestionsMock: vi.fn(() => ({ data: undefined })),
}));

vi.mock('../hooks/useCustomers', () => ({
  useCustomers: useCustomersMock,
  useCreateCustomer: useCreateCustomerMock,
  useCustomerSearchSuggestions: useCustomerSearchSuggestionsMock,
}));

import { CustomerPicker } from './CustomerPicker';

describe('CustomerPicker search results', () => {
  it('renders a multi-token match returned by the authoritative backend without local re-filtering', () => {
    useCustomersMock.mockReturnValue({
      data: {
        data: [{
          id: 'customer-1',
          name: 'محمد سالم عمار',
          phone: '70123456',
          address: null,
          notes: null,
          isActive: true,
          createdAt: '2026-08-03T00:00:00.000Z',
          updatedAt: '2026-08-03T00:00:00.000Z',
        }],
      },
      isLoading: false,
    });
    useCreateCustomerMock.mockReturnValue({
      mutateAsync: vi.fn(),
      isPending: false,
    });

    const html = renderToStaticMarkup(
      <CustomerPicker value="" onChange={vi.fn()} />
    );

    expect(html).toContain('محمد سالم عمار');
    expect(html).toContain('70123456');
    expect(useCustomersMock).toHaveBeenCalledWith({ search: '', limit: 10 });
  });
});
