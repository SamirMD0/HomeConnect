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
export interface SpecCatalogItem {
  key: string;
  label: string;
  group: string;
  unit?: string;
}
export interface ProductSpecification { label: string; value: string }
export interface ResolvedSpecification extends ProductSpecification { unit?: string }
export interface ParsedDimensions { widthMm?: number; heightMm?: number; depthMm?: number }

/** Normalization is intentionally conservative: labels still have to match in full. */
export function normalizeSpecLabel(label: string): string {
  return label
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .toLocaleLowerCase('en')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

export function canonicalKeyForLabel(label: string): CanonicalSpecKey | null {
  const normalized = normalizeSpecLabel(label);
  for (const [key, definition] of Object.entries(CANONICAL_SPEC_KEYS) as Array<[CanonicalSpecKey, typeof CANONICAL_SPEC_KEYS[CanonicalSpecKey]]>) {
    if (definition.aliases.some((alias) => normalizeSpecLabel(alias) === normalized)) return key;
  }
  return null;
}

/** Stable, validator-safe key used when a saved free-form label joins the catalog. */
export function customSpecKey(label: string): string {
  const normalized = normalizeSpecLabel(label);
  let first = 0x811c9dc5;
  let second = 0x9e3779b9;
  for (let index = 0; index < normalized.length; index += 1) {
    const code = normalized.charCodeAt(index);
    first = Math.imul(first ^ code, 0x01000193);
    second = Math.imul(second ^ code, 0x85ebca6b);
  }
  return `custom_${(first >>> 0).toString(36)}_${(second >>> 0).toString(36)}`;
}

export function resolveSpec(
  specs: readonly ProductSpecification[],
  canonicalKey: CanonicalSpecKey,
  extraAliases: readonly string[] = []
): ResolvedSpecification | null {
  const definition = CANONICAL_SPEC_KEYS[canonicalKey];
  const normalizedSpecs = specs.map((spec) => ({ spec, label: normalizeSpecLabel(spec.label) }));
  // Template aliases are intentional overrides, so they are searched before the
  // shared catalog even if a base-alias row occurs earlier in the product list.
  const aliases = [...extraAliases, ...definition.aliases].map(normalizeSpecLabel);
  for (const alias of aliases) {
    const match = normalizedSpecs.find(({ label }) => label === alias);
    if (match) return {
      label: match.spec.label,
      value: match.spec.value,
      ...('unit' in definition ? { unit: definition.unit } : {}),
    };
  }
  return null;
}

export function resolveSpecKey(
  specs: readonly ProductSpecification[],
  key: string,
  extraAliases: readonly string[] = []
): (ResolvedSpecification & { canonicalKey: string }) | null {
  if (key in CANONICAL_SPEC_KEYS) {
    const resolved = resolveSpec(specs, key as CanonicalSpecKey, extraAliases);
    return resolved ? { canonicalKey: key, ...resolved } : null;
  }
  const match = specs.find((spec) => customSpecKey(spec.label) === key);
  return match ? { canonicalKey: key, label: match.label, value: match.value } : null;
}

const dimensionPattern = /(\d+(?:[.,]\d+)?)\s*(mm|cm|m|in(?:ch(?:es)?)?|")?\s*[x×*]\s*(\d+(?:[.,]\d+)?)\s*(mm|cm|m|in(?:ch(?:es)?)?|")?\s*[x×*]\s*(\d+(?:[.,]\d+)?)\s*(mm|cm|m|in(?:ch(?:es)?)?|")?/i;

export function parseDimensions(
  specs: readonly ProductSpecification[],
  extraAliases: readonly string[] = []
): ParsedDimensions {
  const resolved = resolveSpec(specs, 'dimensions', extraAliases);
  if (!resolved) return {};
  const match = dimensionPattern.exec(resolved.value);
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
