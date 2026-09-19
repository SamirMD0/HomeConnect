import type { CurrencyDisplayMode } from '../../types/pricing-card.types';

interface PriceProps {
  value?: string | null;
  currency?: { code: string; display: CurrencyDisplayMode; symbol: string };
  displayOverride?: CurrencyDisplayMode;
  emphasis: 'plain' | 'boxed' | 'underlined';
}

export function Price({ value, currency, displayOverride, emphasis }: PriceProps) {
  if (!value || !currency) return null;
  const amount = Number(value);
  if (!Number.isFinite(amount)) return null;
  const number = new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(amount);
  const display = displayOverride ?? currency.display;
  const text = display === 'CODE'
    ? `${currency.code} ${number}`
    : display === 'SYMBOL_AND_CODE' ? `${currency.symbol}${number} ${currency.code}` : `${currency.symbol}${number}`;
  return <p className={`pricing-card-price pricing-card-price-${emphasis}`}>{text}</p>;
}
