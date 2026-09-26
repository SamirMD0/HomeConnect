import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const css = readFileSync(resolve(__dirname, 'PricingCard.css'), 'utf8');

describe('PricingCard feature layouts', () => {
  it('keeps the base feature mark borderless and provides row and grid-chip layouts', () => {
    const baseRule = /\.pricing-card-feature\s*\{([^}]+)\}/.exec(css)?.[1] ?? '';
    expect(baseRule).not.toMatch(/\bborder\s*:/);
    expect(css).toContain('.pricing-card-features-row');
    expect(css).toContain('.pricing-card-features-grid-chip');
  });

  it('sizes the price tiers at the 6 / 10 / 14 mm bases VISUAL_DESIGN §4 specifies', () => {
    const base = (tier: string) => Number(
      new RegExp(`\\.pricing-card-price-${tier}\\s*\\{[^}]*font-size:\\s*calc\\((\\d+(?:\\.\\d+)?)mm`).exec(css)?.[1],
    );

    expect([base('normal'), base('large'), base('hero')]).toEqual([6, 10, 14]);
  });

  it('gives the hero tier its own full-width row so the price never shares one with the barcode', () => {
    const heroRow = /\.pricing-card-price-code-hero\s*\{([^}]+)\}/.exec(css)?.[1] ?? '';
    expect(heroRow).toMatch(/grid-template-columns:\s*minmax\(0,\s*1fr\)/);
  });

  it('does not force filled SVG artwork back to outline rendering', () => {
    const generalSvgRule = /\.pricing-card-feature-icon svg\s*\{([^}]+)\}/.exec(css)?.[1] ?? '';
    expect(generalSvgRule).not.toMatch(/\bfill\s*:\s*none/);
    expect(css).toContain('svg[fill="none"]');
  });

  it('applies the details scale to model, dimensions, and specification text', () => {
    // Model has its own rule so `body.model.fontScale` layers on top of the
    // shared details scale; dimensions and the spec surfaces still use the
    // details scale directly.
    expect(css).toMatch(/\.pricing-card-model[^{]*\{[^}]*var\(--pricing-card-details-scale\)[^}]*var\(--pricing-card-model-scale/);
    expect(css).toMatch(/\.pricing-card-dimensions[^{]*\{[^}]*var\(--pricing-card-details-scale\)/);
    expect(css).toMatch(/\.pricing-card-specs[^}]*var\(--pricing-card-details-scale\)/);
    expect(css).toMatch(/\.pricing-card-centered-meta[^}]*var\(--pricing-card-details-scale\)/);
    expect(css).toMatch(/\.pricing-card-centered-spec-list[^}]*var\(--pricing-card-details-scale\)/);
  });

  it('provides an optional bold black treatment for all detail rows', () => {
    const emphasizedRule = /\.pricing-card-details-bold \.pricing-card-model,([\s\S]*?)\}/.exec(css)?.[0] ?? '';
    expect(emphasizedRule).toContain('.pricing-card-dimensions');
    expect(emphasizedRule).toContain('.pricing-card-spec-row dt');
    expect(emphasizedRule).toContain('.pricing-card-centered-spec-row dd');
    expect(emphasizedRule).toMatch(/color:\s*#000000/);
    expect(emphasizedRule).toMatch(/font-weight:\s*700/);
  });

  it('preserves contrast inside brand logos in the thermal palette', () => {
    const brandLogoRule = /\.pricing-card-thermal \.pricing-card-brand-logo\s*\{([^}]+)\}/.exec(css)?.[1] ?? '';
    const filterDeclaration = /filter:\s*[^;]+/.exec(brandLogoRule)?.[0] ?? '';
    expect(filterDeclaration).toMatch(/grayscale\(1\) contrast\(1\.2\)/);
    expect(filterDeclaration).not.toContain('brightness(0)');
  });

  it('never shrinks a pricing-card barcode or collapses it into the SKU', () => {
    const barcodeRule = /\.pricing-card-barcode\s*\{([^}]+)\}/.exec(css)?.[1] ?? '';
    const codeRegionRule = /^\.pricing-card-code-region\s*\{([^}]+)\}/m.exec(css)?.[1] ?? '';
    const skuRule = /\.pricing-card-code-region \.pricing-card-sku\s*\{([^}]+)\}/.exec(css)?.[1] ?? '';
    expect(barcodeRule).not.toMatch(/max-width|width:\s*100%|transform|zoom|object-fit/);
    expect(codeRegionRule).toMatch(/justify-items:\s*start/);
    expect(codeRegionRule).toMatch(/gap:\s*1\.2mm/);
    expect(skuRule).toMatch(/justify-self:\s*end/);
    expect(skuRule).toMatch(/text-align:\s*right/);
  });
});
