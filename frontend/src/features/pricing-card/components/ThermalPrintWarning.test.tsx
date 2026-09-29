import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import type { PricingCardTemplate } from '../types/pricing-card.types';
import { ThermalPrintWarning } from './ThermalPrintWarning';

vi.mock('../../products/utils/print-labels', () => ({ canPrintLabelsDirectly: () => true }));

const template = (widthMm: string): PricingCardTemplate => ({
  id: 'template', name: 'Test', description: null, paperMode: 'SINGLE_STICKER', paperSize: null,
  cardWidthMm: widthMm, cardHeightMm: '50', configVersion: 1,
  config: {
    configVersion: 1,
    header: { companyLogo: { show: false, sizeMm: 8, position: 'left' }, brand: { display: 'text', position: 'right', sizeMm: 8 } },
    body: { title: { show: true, maxLines: 2, fontScale: 1 }, detailsFontScale: 1, detailsBoldBlack: false, model: { show: true, fontScale: 1 }, dimensions: { show: true }, specs: { show: true, maxRows: 2 }, image: { show: false, columnWidthPct: 0 } },
    features: { show: false, layout: 'row', showLabels: false, showValues: false },
    price: { show: true, fontScale: 1, weight: 800, emphasis: 'plain', prominence: 'normal', validUntil: { show: false, format: 'dmy' } },
    sku: { show: true, showSecretCode: true, prefix: 'SKU: ', fontScale: 1 },
    barcode: { show: true, showDigits: true, targetWidthMm: 50 },
    appearance: { marginMm: 2, innerGapMm: 1, borderPx: 0, sectionDividers: false, fontScale: 1, orientation: 'landscape', layout: 'stack', palette: 'color' },
  },
  featureMax: 0, specKeyOrder: [], defaultValidityDays: null, isActive: true, archivedAt: null, archivedReason: null,
});

describe('ThermalPrintWarning', () => {
  it('warns when a single card will be scaled to fit an 80 mm thermal roll', () => {
    const html = renderToStaticMarkup(<ThermalPrintWarning template={template('148')} />);
    expect(html).toContain('too wide for an XP-80C');
    expect(html).toContain('148 mm');
    expect(html).toContain('76 mm');
    expect(html).toContain('barcode may not scan');
  });

  it('does not warn for a card within the thermal printer width', () => {
    expect(renderToStaticMarkup(<ThermalPrintWarning template={template('76')} />)).toBe('');
  });
});
