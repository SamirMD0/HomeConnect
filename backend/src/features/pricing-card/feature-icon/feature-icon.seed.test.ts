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
  it('contains exactly the 17 planned safe currentColor SVGs', () => {
    const directory = resolve(__dirname, '../../../../prisma/seed-data/pricing-card-icons');
    const codes = readdirSync(directory).filter((name) => name.endsWith('.svg')).map((name) => name.slice(0, -4)).sort();
    expect(codes).toEqual([...expectedCodes].sort());
    for (const code of codes) {
      const svg = readFileSync(resolve(directory, `${code}.svg`), 'utf8');
      expect(sanitizeSvg(svg)).toContain('currentColor');
      expect(svg).toContain('viewBox="0 0 24 24"');
    }
  });
});
