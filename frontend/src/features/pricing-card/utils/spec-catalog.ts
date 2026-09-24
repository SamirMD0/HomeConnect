/**
 * Client-side twin of `backend/src/features/pricing-card/spec-catalog.ts`.
 *
 * The server owns the canonical resolution the printed card actually uses.
 * The Edit modal needs the same logic on the client so its live preview
 * reflects unsaved spec edits — otherwise typing a value only shows up on
 * the card after Save + query refetch, which defeats the point of a live
 * preview. Keep the two files aligned: adding a new canonical key here
 * without adding it on the server is a bug where the preview lies about
 * what will print. There is no runtime coupling; this is a copy on purpose.
 */

export const CANONICAL_SPEC_KEYS = {
  screen_size: { label: 'Screen size', group: 'Display', aliases: ['screen size', 'size', 'display size', 'screen'], unit: 'inch' },
  resolution: { label: 'Resolution', group: 'Display', aliases: ['resolution', 'display resolution'] },
  refresh_rate: { label: 'Refresh rate', group: 'Display', aliases: ['refresh rate', 'hz'], unit: 'Hz' },
  capacity_kg: { label: 'Capacity (kg)', group: 'Capacity', aliases: ['capacity kg', 'capacity (kg)', 'load kg', 'load capacity', 'washing capacity'], unit: 'kg' },
  capacity_l: { label: 'Capacity (L)', group: 'Capacity', aliases: ['capacity l', 'capacity (l)', 'volume l'], unit: 'L' },
  spin_speed_rpm: { label: 'Spin speed', group: 'Performance', aliases: ['spin speed', 'spin', 'spin speed rpm'], unit: 'rpm' },
  energy_rating: { label: 'Energy rating', group: 'Efficiency', aliases: ['energy rating', 'energy class'] },
  dimensions: { label: 'Dimensions', group: 'Physical', aliases: ['dimensions', 'size (wxhxd)', 'width x height x depth'] },
  weight: { label: 'Weight', group: 'Physical', aliases: ['weight'], unit: 'kg' },
  battery_runtime: { label: 'Battery runtime', group: 'Power', aliases: ['runtime', 'battery runtime', 'battery life'], unit: 'min' },
  charging: { label: 'Charging', group: 'Power', aliases: ['charging', 'charging port'] },
  blade_type: { label: 'Blade type', group: 'Components', aliases: ['blade', 'blade type'] },
} as const satisfies Record<string, {
  readonly label: string;
  readonly group: string;
  readonly aliases: readonly string[];
  readonly unit?: string;
}>;

export type CanonicalSpecKey = keyof typeof CANONICAL_SPEC_KEYS;
export interface RawSpec { label: string; value: string }
export interface ResolvedSpec { canonicalKey: CanonicalSpecKey; label: string; value: string; unit?: string }
export interface ParsedDimensions { widthMm?: number; heightMm?: number; depthMm?: number }

export function normalizeSpecLabel(label: string): string {
  return label
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .toLocaleLowerCase('en')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

function resolveOne(specs: readonly RawSpec[], canonicalKey: CanonicalSpecKey): ResolvedSpec | null {
  const definition = CANONICAL_SPEC_KEYS[canonicalKey];
  const normalizedSpecs = specs.map((spec) => ({ spec, label: normalizeSpecLabel(spec.label) }));
  for (const alias of definition.aliases.map(normalizeSpecLabel)) {
    const match = normalizedSpecs.find(({ label }) => label === alias);
    if (match) return {
      canonicalKey,
      label: definition.label,
      value: match.spec.value,
      ...('unit' in definition ? { unit: definition.unit } : {}),
    };
  }
  return null;
}

/**
 * Walks the template's specKeyOrder and returns the resolved rows the renderer
 * will display. Anything not in the catalog is dropped — matches the server.
 */
export function resolveSpecsForTemplate(
  specifications: readonly RawSpec[],
  specKeyOrder: readonly string[],
): ResolvedSpec[] {
  const resolved: ResolvedSpec[] = [];
  for (const key of specKeyOrder) {
    if (!(key in CANONICAL_SPEC_KEYS)) continue;
    const row = resolveOne(specifications, key as CanonicalSpecKey);
    if (row) resolved.push(row);
  }
  return resolved;
}

const dimensionPattern = /(\d+(?:[.,]\d+)?)\s*(mm|cm|m|in(?:ch(?:es)?)?|")?\s*[x×*]\s*(\d+(?:[.,]\d+)?)\s*(mm|cm|m|in(?:ch(?:es)?)?|")?\s*[x×*]\s*(\d+(?:[.,]\d+)?)\s*(mm|cm|m|in(?:ch(?:es)?)?|")?/i;

export function parseDimensionsFromSpecs(specifications: readonly RawSpec[]): ParsedDimensions {
  const dims = resolveOne(specifications, 'dimensions');
  if (!dims) return {};
  const match = dimensionPattern.exec(dims.value);
  if (!match) return {};
  const commonUnit = match[6] || match[4] || match[2] || 'mm';
  return {
    widthMm: toMillimetres(match[1], match[2] || commonUnit),
    heightMm: toMillimetres(match[3], match[4] || commonUnit),
    depthMm: toMillimetres(match[5], match[6] || commonUnit),
  };
}

function toMillimetres(rawValue: string, rawUnit: string): number {
  const value = Number(rawValue.replace(',', '.'));
  const unit = rawUnit.toLowerCase();
  const factor = unit === 'cm' ? 10 : unit === 'm' ? 1000 : unit === 'mm' ? 1 : 25.4;
  return Math.round(value * factor * 100) / 100;
}
