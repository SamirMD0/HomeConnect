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
  /**
   * `thumbnail` skips the barcode block in favor of a lightweight placeholder,
   * so the browse grid can render hundreds of card previews without paying the
   * JsBarcode paint cost. Every other block still renders — the thumbnail is
   * shape-accurate, not a stub.
   */
  variant?: 'default' | 'thumbnail';
}

type CardStyle = CSSProperties & Record<`--pricing-card-${string}`, string | number>;

/**
 * `brand` is a bare string on non-template label payloads, which carry no logo
 * at all. Only the template-mode object shape can resolve one.
 */
export function brandLogoUrlOf(product: PricingCardData): string | null {
  return typeof product.brand === 'object' ? product.brand?.logoDataUrl ?? null : null;
}

export function PricingCard({ template, product, shopProfile, assets = {}, className = '', variant = 'default' }: PricingCardProps) {
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
    '--pricing-card-price-scale': config.price.fontScale,
    '--pricing-card-price-weight': config.price.weight,
    '--pricing-card-company-logo-size': `${config.header.companyLogo.sizeMm}mm`,
    '--pricing-card-brand-logo-size': `${config.header.brand.sizeMm}mm`,
    '--pricing-card-company-order': config.header.companyLogo.position === 'left' ? 1 : 2,
    '--pricing-card-brand-order': config.header.brand.position === 'left' ? 1 : 2,
  };
  const productImageUrl = assets.productImageUrl ?? product.imageUrl;
  const brandLogoUrl = assets.brandLogoUrl ?? brandLogoUrlOf(product);
  const hasProductImage = config.body.image.show && Boolean(productImageUrl);
  const hasHeader = (config.header.companyLogo.show && Boolean(assets.companyLogoUrl)) || Boolean(product.brand);
  const layout = config.appearance.layout ?? 'stack';
  const barcodeBlock = config.barcode.show && (variant === 'thumbnail'
    ? <div className="pricing-card-barcode-placeholder" aria-hidden style={{ width: `${config.barcode.targetWidthMm}mm`, height: '8mm' }} />
    : <Barcode value={product.barcodeValue} targetWidthMm={config.barcode.targetWidthMm} showDigits={config.barcode.showDigits} />);
  const skuBlock = config.sku.show && <Sku sku={product.sku} staffLabelCode={product.staffLabelCode} internalPriceCode={product.internalPriceCode} showSecretCode={config.sku.showSecretCode} prefix={config.sku.prefix} />;
  const priceBlock = config.price.show && <Price value={product.cashPrice} currency={product.currency} displayOverride={config.price.currencyDisplay} emphasis={config.price.emphasis} prominence={config.price.prominence} />;
  const validUntilBlock = config.price.validUntil.show && <ValidUntil value={product.validUntil} format={config.price.validUntil.format} />;
  const featuresBlock = config.features.show && <Features features={product.features} layout={config.features.layout} showLabels={config.features.showLabels} showValues={config.features.showValues} />;

  if (layout === 'centered') {
    return (
      <article className={`pricing-card pricing-card-centered ${className}`.trim()} style={style}>
        {hasHeader && (
          <header className="pricing-card-centered-header">
            {config.header.companyLogo.show && Boolean(assets.companyLogoUrl) && <CompanyLogo name={shopProfile.name} logoUrl={assets.companyLogoUrl} />}
            <BrandMark brand={product.brand} display={config.header.brand.display} logoUrl={brandLogoUrl} />
          </header>
        )}
        <div className="pricing-card-centered-divider" aria-hidden />
        <section className="pricing-card-centered-body">
          {config.body.title.show && <Title name={product.name} />}
          {(config.body.model.show || config.body.specs.show) && (
            <p className="pricing-card-centered-meta">
              {config.body.model.show && <span className="pricing-card-centered-model">{config.body.model.prefix ?? 'Model: '}{product.model}</span>}
              {config.body.specs.show && (product.resolvedSpecs ?? []).slice(0, config.body.specs.maxRows).map((spec) => (
                <span key={spec.canonicalKey} className="pricing-card-centered-meta-item">
                  <span className="pricing-card-centered-meta-label">{spec.label}:</span> {spec.value}{spec.unit ? ` ${spec.unit}` : ''}
                </span>
              ))}
            </p>
          )}
          {config.body.dimensions.show && <Dimensions dimensions={product.dimensionsMm} />}
        </section>
        {(config.price.show || config.price.validUntil.show) && (
          <div className="pricing-card-centered-price">
            {priceBlock}
            {validUntilBlock}
          </div>
        )}
        {featuresBlock}
        <footer className="pricing-card-centered-footer">
          {skuBlock}
          {barcodeBlock}
        </footer>
      </article>
    );
  }

  return (
    <article className={`pricing-card ${config.appearance.sectionDividers ? 'pricing-card-dividers' : ''} ${className}`.trim()} style={style}>
      {hasHeader && <header className="pricing-card-header">
        {config.header.companyLogo.show && <CompanyLogo name={shopProfile.name} logoUrl={assets.companyLogoUrl} />}
        <BrandMark brand={product.brand} display={config.header.brand.display} logoUrl={brandLogoUrl} />
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
      {featuresBlock}
      <section className={`pricing-card-price-code pricing-card-price-code-${config.price.prominence}`}>
        <div className="pricing-card-price-region">
          {priceBlock}
          {validUntilBlock}
        </div>
        <div className="pricing-card-code-region">
          {barcodeBlock}
          {skuBlock}
        </div>
      </section>
      <Footer tagline={shopProfile.tagline} />
    </article>
  );
}
