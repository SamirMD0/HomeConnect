import type { PricingCardTemplate } from '../types/pricing-card.types';
import type { PricingCardTemplateConfig } from '../schema/template-config.z';

const STORAGE_PREFIX = 'pricing-card-overrides:';
const MAX_BYTES = 8 * 1024;

/**
 * Per-product visual tweaks applied on top of the shared template. Only fields
 * the modal actually exposes are typed — anything else in `config` is a partial
 * merge that lands on the resolved template config.
 *
 * These are intentionally NOT persisted server-side. The template on the DB is
 * shared across every product that binds to it; editing it there would let one
 * shop-floor tweak silently rewrite every other product's card. sessionStorage
 * scopes the tweak to this browser and this product, which is what the plan
 * asked for ("edit the card, not the shared template").
 */
export interface PricingCardOverrides {
  cardWidthMm?: number;
  cardHeightMm?: number;
  config?: DeepPartial<PricingCardTemplateConfig>;
}

type DeepPartial<T> = { [K in keyof T]?: T[K] extends object ? DeepPartial<T[K]> : T[K] };

export function readOverrides(productId: string): PricingCardOverrides {
  if (typeof sessionStorage === 'undefined') return {};
  try {
    const raw = sessionStorage.getItem(STORAGE_PREFIX + productId);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as PricingCardOverrides;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

export function writeOverrides(productId: string, overrides: PricingCardOverrides) {
  if (typeof sessionStorage === 'undefined') return;
  try {
    if (isEmptyOverrides(overrides)) {
      sessionStorage.removeItem(STORAGE_PREFIX + productId);
      return;
    }
    const serialized = JSON.stringify(overrides);
    if (serialized.length > MAX_BYTES) return;
    sessionStorage.setItem(STORAGE_PREFIX + productId, serialized);
  } catch {
    // sessionStorage may be blocked (private windows, quota) — silently ignore.
  }
}

/**
 * Merges the per-product overrides onto a resolved template row so the
 * pricing-card renderer receives a single self-consistent template. The card
 * dimensions and the config are merged separately because they live at
 * different levels of the shape.
 */
export function applyOverridesTo(template: PricingCardTemplate, overrides: PricingCardOverrides): PricingCardTemplate {
  if (!hasContent(overrides)) return template;
  return {
    ...template,
    ...(overrides.cardWidthMm !== undefined ? { cardWidthMm: String(overrides.cardWidthMm) } : {}),
    ...(overrides.cardHeightMm !== undefined ? { cardHeightMm: String(overrides.cardHeightMm) } : {}),
    config: overrides.config ? deepMerge(template.config, overrides.config) : template.config,
  };
}

function hasContent(overrides: PricingCardOverrides): boolean {
  return overrides.cardWidthMm !== undefined
    || overrides.cardHeightMm !== undefined
    || (overrides.config !== undefined && Object.keys(overrides.config).length > 0);
}

function isEmptyOverrides(overrides: PricingCardOverrides): boolean {
  return !hasContent(overrides);
}

/**
 * Merges the override partial into the base config. Arrays and primitives on
 * the override side replace their base counterpart wholesale; nested objects
 * are merged key by key.
 */
function deepMerge<T>(base: T, override: DeepPartial<T>): T {
  if (Array.isArray(base) || override === null || typeof override !== 'object') return base;
  const merged: Record<string, unknown> = { ...(base as unknown as Record<string, unknown>) };
  for (const [key, value] of Object.entries(override)) {
    const currentValue = merged[key];
    if (value !== null && typeof value === 'object' && !Array.isArray(value)
      && currentValue !== null && typeof currentValue === 'object' && !Array.isArray(currentValue)) {
      merged[key] = deepMerge(currentValue, value as DeepPartial<unknown>);
    } else {
      merged[key] = value;
    }
  }
  return merged as T;
}
