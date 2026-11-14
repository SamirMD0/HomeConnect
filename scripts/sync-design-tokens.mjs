#!/usr/bin/env node
/**
 * Copies the PC design tokens (frontend/src/styles/index.css @theme block)
 * into shared/design-tokens.json, which the phone app's Tailwind config reads.
 * One source of truth: change a colour on the PC, run this, and the phone
 * matches. `--check` exits 1 when the JSON is out of date (used by a test).
 *
 *   node scripts/sync-design-tokens.mjs          # write
 *   node scripts/sync-design-tokens.mjs --check  # verify only
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const cssPath = resolve(root, 'frontend/src/styles/index.css');
const jsonPath = resolve(root, 'shared/design-tokens.json');

export function extractTokens(css) {
  const block = /@theme\s*\{([\s\S]*?)\n\}/.exec(css)?.[1];
  if (!block) throw new Error('No @theme block in the PC stylesheet.');
  const colors = {};
  const radius = {};
  for (const [, name, value] of block.matchAll(/--([a-z0-9-]+):\s*([^;]+);/gi)) {
    const v = value.trim();
    if (name.startsWith('color-')) {
      const key = name.slice(6);
      const scale = /^(.*)-(\d{2,3})$/.exec(key);
      if (scale) (colors[scale[1]] ??= {})[scale[2]] = v;
      else colors[key] = v;
    } else if (name.startsWith('radius-')) radius[name.slice(7)] = v;
  }
  // React Native has no CSS variables: resolve var(--color-x-600) to its hex.
  const lookup = (ref) => {
    const scale = /^(.*)-(\d{2,3})$/.exec(ref);
    const found = scale ? colors[scale[1]]?.[scale[2]] : colors[ref];
    if (typeof found !== 'string') throw new Error(`Unknown colour token ${ref}`);
    return found;
  };
  for (const [key, value] of Object.entries(colors)) {
    if (typeof value !== 'string') continue;
    let resolved = value;
    for (let depth = 0; depth < 4 && resolved.startsWith('var('); depth++)
      resolved = lookup(/var\(--color-([a-z0-9-]+)\)/i.exec(resolved)[1]);
    colors[key] = resolved;
  }
  return { source: 'frontend/src/styles/index.css', colors, radius };
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const next = JSON.stringify(extractTokens(readFileSync(cssPath, 'utf8')), null, 2) + '\n';
  if (process.argv.includes('--check')) {
    let current = '';
    try {
      current = readFileSync(jsonPath, 'utf8');
    } catch {}
    if (current.replace(/\r\n/g, '\n') !== next) {
      console.error('shared/design-tokens.json is out of date. Run: node scripts/sync-design-tokens.mjs');
      process.exit(1);
    }
    console.log('Design tokens match the PC.');
  } else {
    writeFileSync(jsonPath, next);
    console.log(`Wrote ${jsonPath}`);
  }
}
