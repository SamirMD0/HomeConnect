import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { sanitizeSvg } from './sanitize-svg';

const expectedCodes = [
  'qled', 'oled', 'uhd-4k', 'dolby-vision', 'google-tv', 'inverter', 'no-frost',
  'energy-a', 'energy-a-plus', 'spin-1400', 'wifi', 'steam', 'cordless', 'waterproof',
  'brushless', 'usb-c-charging', 'digital-display',
];

describe('pricing card feature icon seeds', () => {
  it('contains exactly the 17 planned safe filled currentColor SVGs under 2 KB', () => {
    const directory = resolve(__dirname, '../../../../prisma/seed-data/pricing-card-icons');
    const codes = readdirSync(directory).filter((name) => name.endsWith('.svg')).map((name) => name.slice(0, -4)).sort();
    expect(codes).toEqual([...expectedCodes].sort());
    for (const code of codes) {
      const svg = readFileSync(resolve(directory, `${code}.svg`), 'utf8');
      expect(sanitizeSvg(svg)).toContain('currentColor');
      expect(svg).toContain('viewBox="0 0 24 24"');
      expect(Buffer.byteLength(svg, 'utf8')).toBeLessThanOrEqual(2 * 1024);
      expect(svg).toMatch(/<path\b[^>]*\bfill=["']currentColor["']/i);
    }
  });

  it('updates every shipped code in the visual-refresh data migration', () => {
    const migration = readFileSync(resolve(
      __dirname,
      '../../../../prisma/migrations/20260920220000_refresh_pricing_card_feature_icons/migration.sql',
    ), 'utf8');
    const migratedSvgs = new Map(
      [...migration.matchAll(/\('([a-z0-9-]+)', '(<svg[^']+<\/svg>)'\)/g)]
        .map((match) => [match[1], match[2]]),
    );
    expect(migratedSvgs.size).toBe(expectedCodes.length);
    for (const code of expectedCodes) {
      expect(migratedSvgs.get(code)).toBe(readFileSync(resolve(
        __dirname,
        `../../../../prisma/seed-data/pricing-card-icons/${code}.svg`,
      ), 'utf8').trim());
    }
  });
});
