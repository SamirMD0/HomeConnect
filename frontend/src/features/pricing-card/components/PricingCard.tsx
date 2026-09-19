import type { CSSProperties } from 'react';
import { parseTemplateConfig } from '../schema/template-config.z';
import type { PricingCardData, PricingCardTemplate, ShopProfile } from '../types/pricing-card.types';
import { Barcode } from './blocks/Barcode';
import { BrandMark } from './blocks/BrandMark';
import { CompanyLogo } from './blocks/CompanyLogo';
import { Dimensions } from './blocks/Dimensions';
import { Features } from './blocks/Features';
import { Footer } from './blocks/Footer';
import { Image } from './blocks/Image';
import { Model } from './blocks/Model';
import { Price } from './blocks/Price';
import { Sku } from './blocks/Sku';
import { Specs } from './blocks/Specs';
import { Title } from './blocks/Title';
import { ValidUntil } from './blocks/ValidUntil';

export interface PricingCardAssets {
  companyLogoUrl?: string | null;
  brandLogoUrl?: string | null;
  productImageUrl?: string | null;
}

interface PricingCardProps {
  template: PricingCardTemplate;
  product: PricingCardData;
  shopProfile: ShopProfile;
  assets?: PricingCardAssets;
  className?: string;
}

type CardStyle = CSSProperties & Record<`--pricing-card-${string}`, string | number>;

export function PricingCard({ template, product, shopProfile, assets = {}, className = '' }: PricingCardProps) {
  const config = parseTemplateConfig(template.config);
  const style: CardStyle = {
    '--pricing-card-width': `${template.cardWidthMm}mm`,
    '--pricing-card-height': `${template.cardHeightMm}mm`,
    '--pricing-card-margin': `${config.appearance.marginMm}mm`,
    '--pricing-card-gap': `${config.appearance.innerGapMm}mm`,
    '--pricing-card-border': `${config.appearance.borderPx}px`,
    '--pricing-card-font-scale': config.appearance.fontScale,
    '--pricing-card-title-scale': config.body.title.fontScale,
    '--pricing-card-title-lines': config.body.title.maxLines,
    '--pricing-card-image-width': `${config.body.image.columnWidthPct}%`,
    '--pricing-card-feature-columns': config.features.layout === 'grid-3x2' ? 3 : config.features.layout === 'grid-2x3' ? 2 : 6,
    '--pricing-card-price-scale': config.price.fontScale,
    '--pricing-card-price-weight': config.price.weight,
    '--pricing-card-company-logo-size': `${config.header.companyLogo.sizeMm}mm`,
    '--pricing-card-brand-logo-size': `${config.header.brand.sizeMm}mm`,
    '--pricing-card-company-order': config.header.companyLogo.position === 'left' ? 1 : 2,
    '--pricing-card-brand-order': config.header.brand.position === 'left' ? 1 : 2,
  };
  const productImageUrl = assets.productImageUrl ?? product.imageUrl;
  const hasProductImage = config.body.image.show && Boolean(productImageUrl);
  const hasHeader = (config.header.companyLogo.show && Boolean(assets.companyLogoUrl)) || Boolean(product.brand);

  return (
    <article className={`pricing-card ${config.appearance.sectionDividers ? 'pricing-card-dividers' : ''} ${className}`.trim()} style={style}>
      {hasHeader && <header className="pricing-card-header">
        {config.header.companyLogo.show && <CompanyLogo name={shopProfile.name} logoUrl={assets.companyLogoUrl} />}
        <BrandMark brand={product.brand} display={config.header.brand.display} logoUrl={assets.brandLogoUrl} />
      </header>}
      <section className={`pricing-card-body ${hasProductImage ? 'pricing-card-body-with-image' : ''}`}>
        <div className="pricing-card-copy">
          {config.body.title.show && <Title name={product.name} />}
          {config.body.model.show && <Model model={product.model} prefix={config.body.model.prefix} />}
          {config.body.dimensions.show && <Dimensions dimensions={product.dimensionsMm} />}
          {config.body.specs.show && <Specs specs={product.resolvedSpecs} maxRows={config.body.specs.maxRows} />}
        </div>
        {hasProductImage && <Image name={product.name} imageUrl={productImageUrl} />}
      </section>
      {config.features.show && <Features features={product.features} showLabels={config.features.showLabels} showValues={config.features.showValues} />}
      <section className="pricing-card-price-code">
        <div className="pricing-card-price-region">
          {config.price.show && <Price value={product.cashPrice} currency={product.currency} displayOverride={config.price.currencyDisplay} emphasis={config.price.emphasis} />}
          {config.price.validUntil.show && <ValidUntil value={product.validUntil} format={config.price.validUntil.format} />}
        </div>
        <div className="pricing-card-code-region">
          {config.barcode.show && <Barcode value={product.barcodeValue} targetWidthMm={config.barcode.targetWidthMm} showDigits={config.barcode.showDigits} />}
          {config.sku.show && <Sku sku={product.sku} staffLabelCode={product.staffLabelCode} internalPriceCode={product.internalPriceCode} showSecretCode={config.sku.showSecretCode} prefix={config.sku.prefix} />}
        </div>
      </section>
      <Footer tagline={shopProfile.tagline} />
    </article>
  );
}
