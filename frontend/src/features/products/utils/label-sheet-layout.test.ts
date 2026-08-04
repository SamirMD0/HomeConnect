import { describe, expect, it } from 'vitest';
import { calculateLabelSheetLayout, chunkIntoPages, LabelSheetInput } from './label-sheet-layout';

const base: LabelSheetInput = {
  paper: 'A4',
  labelWidthMm: 50,
  labelHeightMm: 30,
  pageMarginMm: 8,
  labelGapMm: 3,
  columns: 'AUTO',
};

describe('label sheet layout', () => {
  it('fits 3 x 8 labels on A4 at the default 50 x 30mm size', () => {
    // 210 - 16 = 194mm usable: 3 x 50 + 2 x 3 = 156 fits, 4 columns would need 209.
    // 297 - 16 = 281mm usable: 8 x 30 + 7 x 3 = 261 fits, 9 rows would need 294.
    const layout = calculateLabelSheetLayout(base, 24);
    expect(layout.columns).toBe(3);
    expect(layout.rows).toBe(8);
    expect(layout.perPage).toBe(24);
    expect(layout.pages).toBe(1);
    expect(layout.canPrint).toBe(true);
  });

  it('breaks to a second page one label past the page capacity', () => {
    expect(calculateLabelSheetLayout(base, 24).pages).toBe(1);
    expect(calculateLabelSheetLayout(base, 25).pages).toBe(2);
    expect(calculateLabelSheetLayout(base, 0).pages).toBe(0);
  });

  it('lays a label out differently on Letter, which is wider but shorter', () => {
    // 63 x 52mm is chosen because it straddles both paper boundaries; at the
    // 50 x 30 default the two papers happen to agree at 3 x 8.
    const size = { ...base, labelWidthMm: 63, labelHeightMm: 52 };
    const a4 = calculateLabelSheetLayout(size, 10);
    const letter = calculateLabelSheetLayout({ ...size, paper: 'LETTER' }, 10);

    expect([a4.columns, a4.rows]).toEqual([2, 5]);
    expect([letter.columns, letter.rows]).toEqual([3, 4]);
  });

  it('blocks printing when the label cannot fit the paper', () => {
    const layout = calculateLabelSheetLayout({ ...base, labelWidthMm: 240 }, 4);
    expect(layout.canPrint).toBe(false);
    expect(layout.perPage).toBe(0);
    expect(layout.problems.some((problem) => problem.code === 'LABEL_TOO_WIDE' && problem.blocking)).toBe(true);
  });

  it('blocks printing on non-positive dimensions and negative spacing', () => {
    expect(calculateLabelSheetLayout({ ...base, labelWidthMm: 0 }, 1).canPrint).toBe(false);
    expect(calculateLabelSheetLayout({ ...base, labelHeightMm: -5 }, 1).canPrint).toBe(false);
    expect(calculateLabelSheetLayout({ ...base, pageMarginMm: -1 }, 1).canPrint).toBe(false);
    expect(calculateLabelSheetLayout({ ...base, labelGapMm: -1 }, 1).canPrint).toBe(false);
  });

  it('clamps a manual column count that cannot fit, and warns', () => {
    const layout = calculateLabelSheetLayout({ ...base, columns: 8 }, 10);
    expect(layout.columns).toBe(3);
    expect(layout.canPrint).toBe(true);
    const clamped = layout.problems.find((problem) => problem.code === 'COLUMNS_CLAMPED');
    expect(clamped?.blocking).toBe(false);
  });

  it('honours a manual column count that does fit', () => {
    expect(calculateLabelSheetLayout({ ...base, columns: 2 }, 10).columns).toBe(2);
  });

  it('warns without blocking on a very large print run', () => {
    const layout = calculateLabelSheetLayout(base, 24 * 21);
    expect(layout.canPrint).toBe(true);
    expect(layout.problems.some((problem) => problem.code === 'MANY_PAGES' && !problem.blocking)).toBe(true);
  });

  it('never produces zero columns or rows for a label that fits exactly', () => {
    const layout = calculateLabelSheetLayout({ ...base, labelWidthMm: 194, labelHeightMm: 281 }, 3);
    expect(layout.columns).toBe(1);
    expect(layout.rows).toBe(1);
    expect(layout.pages).toBe(3);
  });

  it('chunks labels into pages and drops nothing', () => {
    expect(chunkIntoPages([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
    expect(chunkIntoPages([1, 2, 3], 0)).toEqual([]);
    expect(chunkIntoPages([], 4)).toEqual([]);
  });
});
