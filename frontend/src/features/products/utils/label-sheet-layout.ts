/**
 * Pure geometry for the printable label sheet.
 *
 * Everything here is millimetres, because a sticker is a physical object: the
 * same numbers drive the on-screen preview and the `@page` rule, so what is
 * previewed is what is printed. No component should do this arithmetic inline.
 */

export type LabelPaperSize = 'A4' | 'LETTER';

export interface PaperDimensions { widthMm: number; heightMm: number }

export const PAPER_SIZES: Record<LabelPaperSize, PaperDimensions> = {
  A4: { widthMm: 210, heightMm: 297 },
  LETTER: { widthMm: 215.9, heightMm: 279.4 },
};

/** Maps to the `size` keyword in the injected `@page` rule. */
export const PAPER_CSS_SIZE: Record<LabelPaperSize, string> = { A4: 'A4', LETTER: 'letter' };

export interface LabelSheetInput {
  paper: LabelPaperSize;
  labelWidthMm: number;
  labelHeightMm: number;
  pageMarginMm: number;
  labelGapMm: number;
  /** 'AUTO' fits as many columns as the usable width allows. */
  columns: number | 'AUTO';
}

export type LabelSheetProblemCode =
  | 'INVALID_LABEL_WIDTH'
  | 'INVALID_LABEL_HEIGHT'
  | 'INVALID_MARGIN'
  | 'INVALID_GAP'
  | 'LABEL_TOO_WIDE'
  | 'LABEL_TOO_TALL'
  | 'COLUMNS_CLAMPED'
  | 'MANY_PAGES';

export interface LabelSheetProblem {
  code: LabelSheetProblemCode;
  message: string;
  /** Blocking problems disable Print and Export rather than printing garbage. */
  blocking: boolean;
}

export interface LabelSheetLayout {
  paper: PaperDimensions;
  columns: number;
  rows: number;
  perPage: number;
  pages: number;
  usableWidthMm: number;
  usableHeightMm: number;
  problems: LabelSheetProblem[];
  /** True when nothing blocking was found, so the sheet can be printed. */
  canPrint: boolean;
}

/** Above this a print run is more likely a mistake than an intention. */
const MANY_PAGES_THRESHOLD = 20;

/**
 * Fits `labelCount` labels onto `paper`.
 *
 * Returns a layout even when the settings are unusable, so the preview can keep
 * rendering its chrome and explain the problem instead of blanking out. Callers
 * must check `canPrint` before offering Print or Export.
 */
export function calculateLabelSheetLayout(input: LabelSheetInput, labelCount: number): LabelSheetLayout {
  const paper = PAPER_SIZES[input.paper] ?? PAPER_SIZES.A4;
  const problems: LabelSheetProblem[] = [];

  const width = input.labelWidthMm;
  const height = input.labelHeightMm;
  const margin = input.pageMarginMm;
  const gap = input.labelGapMm;

  if (!Number.isFinite(width) || width <= 0) problems.push({ code: 'INVALID_LABEL_WIDTH', message: 'Label width must be greater than 0 mm.', blocking: true });
  if (!Number.isFinite(height) || height <= 0) problems.push({ code: 'INVALID_LABEL_HEIGHT', message: 'Label height must be greater than 0 mm.', blocking: true });
  if (!Number.isFinite(margin) || margin < 0) problems.push({ code: 'INVALID_MARGIN', message: 'Page margin cannot be negative.', blocking: true });
  if (!Number.isFinite(gap) || gap < 0) problems.push({ code: 'INVALID_GAP', message: 'Gap between labels cannot be negative.', blocking: true });

  const usableWidthMm = paper.widthMm - 2 * margin;
  const usableHeightMm = paper.heightMm - 2 * margin;

  if (problems.length === 0) {
    if (width > usableWidthMm) {
      problems.push({
        code: 'LABEL_TOO_WIDE',
        message: `A ${trim(width)}mm label does not fit ${label(input.paper)} with ${trim(margin)}mm margins (${trim(usableWidthMm)}mm usable).`,
        blocking: true,
      });
    }
    if (height > usableHeightMm) {
      problems.push({
        code: 'LABEL_TOO_TALL',
        message: `A ${trim(height)}mm label does not fit ${label(input.paper)} with ${trim(margin)}mm margins (${trim(usableHeightMm)}mm usable).`,
        blocking: true,
      });
    }
  }

  const blocked = problems.some((problem) => problem.blocking);
  if (blocked) {
    return { paper, columns: 0, rows: 0, perPage: 0, pages: 0, usableWidthMm, usableHeightMm, problems, canPrint: false };
  }

  const maxColumns = fit(usableWidthMm, width, gap);
  const rows = fit(usableHeightMm, height, gap);

  let columns = maxColumns;
  if (input.columns !== 'AUTO') {
    const requested = Math.floor(input.columns);
    columns = Math.max(1, Math.min(requested, maxColumns));
    if (requested > maxColumns) {
      problems.push({
        code: 'COLUMNS_CLAMPED',
        message: `Only ${maxColumns} column${maxColumns === 1 ? '' : 's'} fit across ${label(input.paper)}. Using ${maxColumns}.`,
        blocking: false,
      });
    }
  }

  const perPage = columns * rows;
  const pages = perPage > 0 ? Math.ceil(Math.max(0, labelCount) / perPage) : 0;

  if (pages > MANY_PAGES_THRESHOLD) {
    problems.push({ code: 'MANY_PAGES', message: `This will print ${pages} pages.`, blocking: false });
  }

  return { paper, columns, rows, perPage, pages, usableWidthMm, usableHeightMm, problems, canPrint: true };
}

/**
 * Splits labels into per-page chunks. The preview renders one page element per
 * chunk, which is what makes the preview structurally identical to the output.
 */
export function chunkIntoPages<T>(items: T[], perPage: number): T[][] {
  if (perPage <= 0) return [];
  const pages: T[][] = [];
  for (let index = 0; index < items.length; index += perPage) pages.push(items.slice(index, index + perPage));
  return pages;
}

/**
 * How many fixed-size cells fit in `available` when every cell after the first
 * is preceded by a gap. Never returns less than 1 — a caller that reaches here
 * has already proven a single label fits.
 */
function fit(available: number, size: number, gap: number): number {
  return Math.max(1, Math.floor((available + gap) / (size + gap)));
}

const label = (paper: LabelPaperSize) => (paper === 'A4' ? 'A4' : 'Letter');

/** Drops the trailing `.0` so messages read "50mm", not "50.0mm". */
const trim = (value: number) => String(Math.round(value * 10) / 10);
