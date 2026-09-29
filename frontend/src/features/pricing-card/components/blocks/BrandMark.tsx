import type { PricingCardBrand } from '../../types/pricing-card.types';

interface BrandMarkProps {
  brand: PricingCardBrand | string | null;
  display: 'text' | 'logo' | 'logo+text';
  logoUrl?: string | null;
}

export function BrandMark({ brand, display, logoUrl }: BrandMarkProps) {
  if (!brand) return null;
  const name = typeof brand === 'string' ? brand : brand.displayName;
  const showLogo = display !== 'text' && Boolean(logoUrl);
  const showText = display !== 'logo' || !showLogo;
  return (
    <div className="pricing-card-brand-mark">
      {showLogo && <img className="pricing-card-brand-logo" src={logoUrl!} alt="" />}
      {showText && <span>{name}</span>}
    </div>
  );
}
