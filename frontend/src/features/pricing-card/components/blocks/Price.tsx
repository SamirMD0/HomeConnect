import type { CurrencyDisplayMode } from '../../types/pricing-card.types';

interface PriceProps {
  value?: string | null;
  currency?: { code: string; display: CurrencyDisplayMode; symbol: string };
  displayOverride?: CurrencyDisplayMode;
  emphasis: 'plain' | 'boxed' | 'underlined';
  /** VISUAL_DESIGN §4 — the size tier the card is drawn at: 6 / 10 / 14 mm. */
  prominence: 'normal' | 'large' | 'hero';
}

export function Price({ value, currency, displayOverride, emphasis, prominence }: PriceProps) {
  if (!value || !currency) return null;
  const amount = Number(value);
  if (!Number.isFinite(amount)) return null;
  // Shelf-card convention: drop the ".00" tail on whole dollars, keep cents
  // only when a real value would otherwise be lost. `$436` reads instantly;
  // `$436.00` reads as small print at hero size.
  const hasCents = Math.round(amount * 100) % 100 !== 0;
  const number = new Intl.NumberFormat('en-US', {
    minimumFractionDigits: hasCents ? 2 : 0,
    maximumFractionDigits: 2,
  }).format(amount);
  const display = displayOverride ?? currency.display;
  const text = display === 'CODE'
    ? `${currency.code} ${number}`
    : display === 'SYMBOL_AND_CODE' ? `${currency.symbol}${number} ${currency.code}` : `${currency.symbol}${number}`;
  return <p className={`pricing-card-price pricing-card-price-${emphasis} pricing-card-price-${prominence}`}>{text}</p>;
}
