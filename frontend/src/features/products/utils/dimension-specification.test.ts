import { describe, expect, it } from 'vitest';
import { dimensionDraftFromValue, dimensionValueFromDraft, hasCompleteDimensions, isDimensionLabel } from './dimension-specification';

describe('dimension specification editor values', () => {
  it('reads existing compact and labelled dimension values', () => {
    expect(dimensionDraftFromValue('1111x697x280mm')).toEqual({ width: '1111', height: '697', depth: '280' });
    expect(dimensionDraftFromValue('W 1111 mm × H 697 mm × D 280 mm')).toEqual({ width: '1111', height: '697', depth: '280' });
  });

  it('converts a shared legacy unit to millimetres', () => {
    expect(dimensionDraftFromValue('120 x 75 x 8 cm')).toEqual({ width: '1200', height: '750', depth: '80' });
  });

  it('keeps partial field edits and detects completion', () => {
    const partial = dimensionValueFromDraft({ width: '1111', height: '', depth: '280' });
    expect(dimensionDraftFromValue(partial)).toEqual({ width: '1111', height: '', depth: '280' });
    expect(hasCompleteDimensions(partial)).toBe(false);
    expect(hasCompleteDimensions('1111 × 697 × 280 mm')).toBe(true);
  });

  it('recognises canonical and legacy dimension labels', () => {
    expect(isDimensionLabel('Dimensions')).toBe(true);
    expect(isDimensionLabel('size (wxhxd)')).toBe(true);
    expect(isDimensionLabel('Screen size')).toBe(false);
  });
});
