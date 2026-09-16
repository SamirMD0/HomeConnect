import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { CreditLimitWarning, creditLimitWarningFromError } from './CreditLimitWarning';
const warning = { currency: 'USD' as const, currentOutstanding: '70.00', creditLimit: '100.00', projectedOutstanding: '101.00', overage: '1.00' };
describe('server-derived credit-limit warning', () => {
  it('shows server amounts bilingually and offers ADMIN verification', () => {
    const html = renderToStaticMarkup(<CreditLimitWarning warning={warning} isAdmin value={{}} onChange={vi.fn()} />);
    for (const amount of ['$70.00', '$100.00', '$101.00', '$1.00']) expect(html).toContain(amount);
    expect(html).toContain('حد الائتمان'); expect(html).toContain('type="password"');
    expect(html).toContain('Override reason');
  });
  it('does not offer employee override controls or change unrestricted layouts', () => {
    const html = renderToStaticMarkup(<CreditLimitWarning warning={warning} isAdmin={false} value={{}} onChange={vi.fn()} />);
    expect(html).not.toContain('type="password"'); expect(html).toContain('ADMIN approval required');
    expect(renderToStaticMarkup(<CreditLimitWarning warning={null} isAdmin value={{}} onChange={vi.fn()} />)).toBe('');
  });
  it('reads only authoritative server warning fields, ignoring unrelated errors', () => {
    expect(creditLimitWarningFromError({ response: { data: { error: { code: 'CREDIT_LIMIT_EXCEEDED', details: warning } } } })).toEqual(warning);
    expect(creditLimitWarningFromError({ response: { data: { error: { code: 'VALIDATION_ERROR', details: warning } } } })).toBeNull();
  });
});
