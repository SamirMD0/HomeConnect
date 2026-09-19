import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import applianceConfig from '../../../../../backend/prisma/seed-data/pricing-card-templates/appliance-shelf.json';
import compactConfig from '../../../../../backend/prisma/seed-data/pricing-card-templates/compact-legacy.json';
import largeConfig from '../../../../../backend/prisma/seed-data/pricing-card-templates/large-legacy.json';
import tvConfig from '../../../../../backend/prisma/seed-data/pricing-card-templates/tv-large.json';
import type { PricingCardTemplate } from '../types/pricing-card.types';
import { PricingCard } from './PricingCard';
import { pricingCardSamples } from '../samples';

const template = (
  id: string,
  name: string,
  width: string,
  height: string,
  config: unknown,
): PricingCardTemplate => ({
  id,
  name,
  description: null,
  paperMode: 'FIXED',
  paperSize: null,
  cardWidthMm: width,
  cardHeightMm: height,
  configVersion: 1,
  config: config as PricingCardTemplate['config'],
  featureMax: 6,
  specKeyOrder: [],
  defaultValidityDays: 30,
  isActive: true,
  archivedAt: null,
  archivedReason: null,
});

const templates = [
  template('tv-large', 'TV Large', '148', '105', tvConfig),
  template('appliance-shelf', 'Appliance Shelf', '105', '74', applianceConfig),
  template('compact-legacy', 'Compact Legacy', '58', '40', compactConfig),
  template('large-legacy', 'Legacy Large', '72', '50', largeConfig),
];

const shopProfile = {
  id: 'shop-profile',
  name: 'Home Connect',
  tagline: 'Your home, connected.',
  hasLogo: true,
  logoMimeType: 'image/webp',
  logoByteSize: 100,
  currencyCode: 'USD',
  currencyDisplay: 'SYMBOL' as const,
  defaultPricingCardTemplateId: 'tv-large',
  defaultCardValidityDays: 30,
  snapshotPrintedCards: true,
  pricingCardRolloutMode: 'BOTH' as const,
};

const render = (selectedTemplate: PricingCardTemplate, sampleIndex: number) => renderToStaticMarkup(
  <PricingCard
    template={selectedTemplate}
    product={pricingCardSamples[sampleIndex].product}
    shopProfile={shopProfile}
    assets={pricingCardSamples[sampleIndex].assets}
  />,
);

describe('PricingCard renderer', () => {
  for (const selectedTemplate of templates) {
    for (const [sampleIndex, sample] of pricingCardSamples.entries()) {
      it(`${selectedTemplate.name} × ${sample.name}`, () => {
        expect(render(selectedTemplate, sampleIndex)).toMatchSnapshot();
      });
    }
  }

  it('renders the TV content, features, barcode surface, and validity date', () => {
    const html = render(templates[0], 0);
    expect(html).toContain('TCL');
    expect(html).toContain('$');
    for (const feature of pricingCardSamples[0].product.features ?? []) expect(html).toContain(feature.label);
    expect(html).toContain('<svg');
    expect(html).toContain('Valid until');
  });

  it('collapses absent optional blocks without invalid inline values', () => {
    const html = render(templates[0], 4);
    expect(html).not.toContain('pricing-card-dimensions');
    expect(html).not.toContain('pricing-card-features');
    expect(html).not.toContain('<img class="pricing-card-image"');
    expect(html).not.toContain('NaN');
  });
});
