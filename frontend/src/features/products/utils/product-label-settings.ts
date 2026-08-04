import { LabelPaperSize } from './label-sheet-layout';

export interface ProductLabelDimensions { widthMm: number; heightMm: number; autoFit: boolean }

export const DEFAULT_PRODUCT_LABEL_DIMENSIONS: ProductLabelDimensions = { widthMm: 50, heightMm: 30, autoFit: true };
const STORAGE_KEY = 'homeconnect.product-label-dimensions';

export function loadProductLabelDimensions(): ProductLabelDimensions {
  try {
    const value = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}') as Partial<ProductLabelDimensions>;
    if (valid(value.widthMm) && valid(value.heightMm)) return { widthMm: value.widthMm!, heightMm: value.heightMm!, autoFit: value.autoFit !== false };
  } catch { /* Use the printer-safe default when preferences are malformed. */ }
  return DEFAULT_PRODUCT_LABEL_DIMENSIONS;
}

export function saveProductLabelDimensions(value: ProductLabelDimensions): void {
  if (!valid(value.widthMm) || !valid(value.heightMm)) return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
}

const valid = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value) && value >= 20 && value <= 150;

/**
 * Bulk sheet printing.
 *
 * SHEET tiles many labels onto one page of ordinary paper to be cut by hand.
 * STICKER keeps the original one-label-per-page behaviour for die-cut stock, so
 * upgrading does not break anyone already feeding label rolls through.
 */
export type LabelPrintMode = 'SHEET' | 'STICKER';

export interface ProductLabelSheetSettings {
  mode: LabelPrintMode;
  paper: LabelPaperSize;
  labelWidthMm: number;
  labelHeightMm: number;
  pageMarginMm: number;
  labelGapMm: number;
  columns: number | 'AUTO';
  showCutGuides: boolean;
}

export const DEFAULT_PRODUCT_LABEL_SHEET_SETTINGS: ProductLabelSheetSettings = {
  mode: 'SHEET',
  paper: 'A4',
  labelWidthMm: 50,
  labelHeightMm: 30,
  pageMarginMm: 8,
  labelGapMm: 3,
  columns: 'AUTO',
  showCutGuides: true,
};

const SHEET_STORAGE_KEY = 'homeconnect.product-label-sheet';

/** Margins and gaps need their own band — `valid()`'s 20mm floor would reject every sane value. */
export const validSpacing = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 30;

const validColumns = (value: unknown): value is number | 'AUTO' =>
  value === 'AUTO' || (typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= 20);

export function loadProductLabelSheetSettings(): ProductLabelSheetSettings {
  const defaults = { ...DEFAULT_PRODUCT_LABEL_SHEET_SETTINGS, ...legacyLabelSize() };
  try {
    const stored = localStorage.getItem(SHEET_STORAGE_KEY);
    if (!stored) return defaults;
    const value = JSON.parse(stored) as Partial<ProductLabelSheetSettings>;
    return {
      mode: value.mode === 'STICKER' ? 'STICKER' : 'SHEET',
      paper: value.paper === 'LETTER' ? 'LETTER' : 'A4',
      labelWidthMm: valid(value.labelWidthMm) ? value.labelWidthMm : defaults.labelWidthMm,
      labelHeightMm: valid(value.labelHeightMm) ? value.labelHeightMm : defaults.labelHeightMm,
      pageMarginMm: validSpacing(value.pageMarginMm) ? value.pageMarginMm : defaults.pageMarginMm,
      labelGapMm: validSpacing(value.labelGapMm) ? value.labelGapMm : defaults.labelGapMm,
      columns: validColumns(value.columns) ? value.columns : defaults.columns,
      showCutGuides: value.showCutGuides !== false,
    };
  } catch { /* Fall back to printer-safe defaults when preferences are malformed. */ }
  return defaults;
}

export function saveProductLabelSheetSettings(value: ProductLabelSheetSettings): void {
  if (!valid(value.labelWidthMm) || !valid(value.labelHeightMm)) return;
  if (!validSpacing(value.pageMarginMm) || !validSpacing(value.labelGapMm)) return;
  localStorage.setItem(SHEET_STORAGE_KEY, JSON.stringify(value));
}

/**
 * Before sheet printing existed, label size lived under the single-label key.
 * Seed from it so an existing sticker size carries over on first use.
 */
function legacyLabelSize(): Partial<ProductLabelSheetSettings> {
  try {
    const legacy = loadProductLabelDimensions();
    return { labelWidthMm: legacy.widthMm, labelHeightMm: legacy.heightMm };
  } catch { return {}; }
}
