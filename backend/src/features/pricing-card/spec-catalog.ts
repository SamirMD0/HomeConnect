export const CANONICAL_SPEC_KEYS = {
  screen_size: { aliases: ['screen size', 'size', 'display size', 'screen'], unit: 'inch' },
  resolution: { aliases: ['resolution', 'display resolution'] },
  refresh_rate: { aliases: ['refresh rate', 'hz'], unit: 'Hz' },
  capacity_kg: { aliases: ['capacity kg', 'capacity (kg)', 'load kg', 'load capacity', 'washing capacity'], unit: 'kg' },
  capacity_l: { aliases: ['capacity l', 'capacity (l)', 'volume l'], unit: 'L' },
  spin_speed_rpm: { aliases: ['spin speed', 'spin', 'spin speed rpm'], unit: 'rpm' },
  energy_rating: { aliases: ['energy rating', 'energy class'] },
  dimensions: { aliases: ['dimensions', 'size (wxhxd)', 'width x height x depth'] },
  weight: { aliases: ['weight'], unit: 'kg' },
  battery_runtime: { aliases: ['runtime', 'battery runtime', 'battery life'], unit: 'min' },
  charging: { aliases: ['charging', 'charging port'] },
  blade_type: { aliases: ['blade', 'blade type'] },
} as const satisfies Record<string, { readonly aliases: readonly string[]; readonly unit?: string }>;

export type CanonicalSpecKey = keyof typeof CANONICAL_SPEC_KEYS;
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

const dimensionPattern = /(\d+(?:[.,]\d+)?)\s*(mm|cm|m|in(?:ch(?:es)?)?|\")?\s*[x×*]\s*(\d+(?:[.,]\d+)?)\s*(mm|cm|m|in(?:ch(?:es)?)?|\")?\s*[x×*]\s*(\d+(?:[.,]\d+)?)\s*(mm|cm|m|in(?:ch(?:es)?)?|\")?/i;

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
