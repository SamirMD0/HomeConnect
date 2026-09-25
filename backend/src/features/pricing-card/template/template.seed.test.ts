import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseTemplateConfig } from './pricing-card-template-config.z';

describe('pricing card template seeds', () => {
  it('contains exactly five valid version-one configs', () => {
    const directory = resolve(__dirname, '../../../../prisma/seed-data/pricing-card-templates');
    const files = readdirSync(directory).filter((name) => name.endsWith('.json')).sort();
    expect(files).toEqual(['appliance-shelf-thermal.json', 'appliance-shelf.json', 'compact-legacy.json', 'large-legacy.json', 'tv-large.json']);
    for (const file of files) expect(parseTemplateConfig(JSON.parse(readFileSync(resolve(directory, file), 'utf8'))).configVersion).toBe(1);
  });
});
