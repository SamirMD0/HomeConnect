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
  paperMode: 'SINGLE_STICKER',
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
  template('appliance-shelf', 'Appliance Shelf', '120', '80', applianceConfig),
  template('compact-legacy', 'Compact Legacy', '58', '40', compactConfig),
  template('large-legacy', 'Legacy Large', '72', '50', largeConfig),
];

const shopProfile: import('../types/pricing-card.types').ShopProfile = {
  id: 'shop-profile',
  name: 'Home Connect',
  tagline: 'Your home, connected.',
  hasLogo: true,
  logoMimeType: 'image/webp',
  logoByteSize: 100,
  logoDataUrl: null,
  currencyCode: 'USD',
  currencyDisplay: 'SYMBOL' as const,
  defaultPricingCardTemplateId: 'tv-large',
  categoryDefaultTemplates: {},
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
    expect(html).toContain('pricing-card-features-grid-chip');
  });

  it('renders the borderless row layout with its explicit layout class', () => {
    const rowTemplate = {
      ...templates[0],
      config: {
        ...templates[0].config,
        features: { ...templates[0].config.features, layout: 'row' as const },
      },
    };
    expect(render(rowTemplate, 0)).toContain('pricing-card-features-row');
  });

  // VISUAL_DESIGN §4: the tier picks the base size and `price.fontScale` still
  // multiplies it. TV Large ships at scale 1, so hero lands on the spec's 14 mm.
  describe('price prominence', () => {
    // Force the stack layout: the prominence classes live on the stack-layout
    // price/code region. The centered layout uses its own price container.
    const atProminence = (prominence: 'normal' | 'large' | 'hero') => renderToStaticMarkup(
      <PricingCard
        template={{ ...templates[0], config: { ...templates[0].config, price: { ...templates[0].config.price, prominence }, appearance: { ...templates[0].config.appearance, layout: 'stack' } } }}
        product={pricingCardSamples[0].product}
        shopProfile={shopProfile}
        assets={pricingCardSamples[0].assets}
      />,
    );

    it.each(['normal', 'large', 'hero'] as const)('renders TV Large at the %s tier', (prominence) => {
      const html = atProminence(prominence);
      expect(html).toContain(`pricing-card-price-${prominence}`);
      expect(html).toContain(`pricing-card-price-code pricing-card-price-code-${prominence}`);
      expect(html).toMatchSnapshot();
    });
  });

  it('collapses absent optional blocks without invalid inline values', () => {
    // Pin the stack layout so the assertion talks about the classic block markup.
    const stackTv = { ...templates[0], config: { ...templates[0].config, appearance: { ...templates[0].config.appearance, layout: 'stack' as const } } };
    const html = renderToStaticMarkup(
      <PricingCard template={stackTv} product={pricingCardSamples[4].product} shopProfile={shopProfile} assets={pricingCardSamples[4].assets} />,
    );
    expect(html).not.toContain('pricing-card-dimensions');
    expect(html).not.toContain('pricing-card-features');
    expect(html).not.toContain('<img class="pricing-card-image"');
    expect(html).not.toContain('NaN');
  });
});
