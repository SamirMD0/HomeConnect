import { afterEach, describe, expect, it, vi } from 'vitest';
import { printPricingCards } from './print-pricing-cards';

afterEach(() => vi.unstubAllGlobals());

describe('printPricingCards', () => {
  it('uses the Electron fixed-size print bridge when available', async () => {
    const printLabels = vi.fn().mockResolvedValue({ printed: true });
    vi.stubGlobal('window', { electronAPI: { printLabels }, print: vi.fn() });

    await expect(printPricingCards({ widthMm: 148, heightMm: 105 })).resolves.toEqual({ printed: true });
    expect(printLabels).toHaveBeenCalledWith({ widthMm: 148, heightMm: 105 });
  });

  it('falls back to the browser print dialog', async () => {
    const print = vi.fn();
    vi.stubGlobal('window', { print });

    await expect(printPricingCards(null)).resolves.toEqual({ printed: true });
    expect(print).toHaveBeenCalledOnce();
  });
});
