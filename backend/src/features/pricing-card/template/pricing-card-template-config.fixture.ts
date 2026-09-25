export const minimumTemplateConfig = {
  configVersion: 1 as const,
  header: { companyLogo: { show: true, sizeMm: 12, position: 'left' as const }, brand: { display: 'text' as const, position: 'right' as const, sizeMm: 10 } },
  body: { title: { show: true, maxLines: 2 as const, fontScale: 1 }, detailsFontScale: 1, detailsBoldBlack: false, model: { show: true, prefix: 'Model:', fontScale: 1 }, dimensions: { show: true }, specs: { show: true, maxRows: 4 }, image: { show: false, columnWidthPct: 0 } },
  features: { show: true, layout: 'row' as const, showLabels: true, showValues: true },
  price: { show: true, fontScale: 1, weight: 800 as const, emphasis: 'plain' as const, prominence: 'normal' as const, validUntil: { show: true, format: 'dmy' as const } },
  sku: { show: true, showSecretCode: true, prefix: 'SKU:', fontScale: 1 },
  barcode: { show: true, showDigits: true, targetWidthMm: 50 },
  appearance: { marginMm: 3, innerGapMm: 2, borderPx: 1 as const, sectionDividers: true, fontScale: 1, orientation: 'landscape' as const, layout: 'stack' as const, palette: 'color' as const },
};
