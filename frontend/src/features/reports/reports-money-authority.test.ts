import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

describe('reports frontend money authority', () => {
  it('does not aggregate or parse money inside report components', () => {
    const componentsDir = path.resolve(process.cwd(), 'frontend/src/features/reports/components');
    const source = fs.readdirSync(componentsDir)
      .filter((file) => file.endsWith('.tsx') && !file.endsWith('.test.tsx'))
      .map((file) => fs.readFileSync(path.join(componentsDir, file), 'utf8'))
      .join('\n');

    expect(source).not.toMatch(/\.reduce\s*\(/);
    expect(source).not.toMatch(/parseFloat\s*\(/);
  });

  it('keeps printable report section headers visible while hiding only app chrome', () => {
    const printCss = fs.readFileSync(path.resolve(process.cwd(), 'frontend/src/features/reports/print.css'), 'utf8');
    const layout = fs.readFileSync(path.resolve(process.cwd(), 'frontend/src/layouts/DashboardLayout.tsx'), 'utf8');
    expect(printCss).not.toMatch(/(^|,)\s*header\s*(,|\{)/m);
    expect(layout).toContain('<header className="no-print ');
    expect(printCss).toContain('.report-print-root thead');
  });
});
