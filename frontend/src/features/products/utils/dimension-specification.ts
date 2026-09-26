export interface DimensionDraft {
  width: string;
  height: string;
  depth: string;
}

const DIMENSION_LABELS = new Set(['dimension', 'dimensions', 'size (wxhxd)', 'width x height x depth']);
const NUMBER = /\d+(?:[.,]\d+)?/;

export function isDimensionLabel(label: string): boolean {
  return DIMENSION_LABELS.has(label.trim().toLocaleLowerCase('en'));
}

/**
 * Reads both the legacy free-text value and the partially completed value made
 * by the three-field editor. Completed cm/m/in values are converted to mm so
 * opening an old product never changes the physical dimensions it represents.
 */
export function dimensionDraftFromValue(value: string): DimensionDraft {
  const parts = value.split(/\s*[x×*]\s*/).slice(0, 3);
  const commonUnit = unitOf(parts[2] ?? '') || unitOf(parts[1] ?? '') || unitOf(parts[0] ?? '') || 'mm';
  const values = [0, 1, 2].map((index) => {
    const part = parts[index] ?? '';
    const match = NUMBER.exec(part);
    if (!match) return '';
    const millimetres = toMillimetres(match[0], unitOf(part) || commonUnit);
    return Number.isFinite(millimetres) ? String(millimetres) : '';
  });
  return { width: values[0], height: values[1], depth: values[2] };
}

export function dimensionValueFromDraft(draft: DimensionDraft): string {
  return `${draft.width.trim()} × ${draft.height.trim()} × ${draft.depth.trim()} mm`;
}

export function hasCompleteDimensions(value: string): boolean {
  return Object.values(dimensionDraftFromValue(value)).every((part) => Number(part) > 0);
}

function unitOf(value: string): string {
  return /(mm|cm|m|in(?:ch(?:es)?)?|")\s*$/i.exec(value.trim())?.[1] ?? '';
}

function toMillimetres(rawValue: string, rawUnit: string): number {
  const value = Number(rawValue.replace(',', '.'));
  const unit = rawUnit.toLocaleLowerCase('en');
  const factor = unit === 'cm' ? 10 : unit === 'm' ? 1000 : unit === 'mm' ? 1 : 25.4;
  return Math.round(value * factor * 100) / 100;
}
