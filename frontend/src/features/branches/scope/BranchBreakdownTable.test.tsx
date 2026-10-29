import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { BranchBreakdownTable } from './BranchBreakdownTable';

type Figures = { owed: string; count: number };
const metrics = [
  { label: 'Owed', numeric: true, value: (f: Figures) => f.owed },
  { label: 'Customers', numeric: true, value: (f: Figures) => f.count },
];
const rowA = { branchId: 'a', branchCode: 'MAIN', branchName: 'Main branch', owed: '80.00', count: 2 };
const rowB = { branchId: 'b', branchCode: 'TYRE', branchName: 'فرع صور', owed: '160.00', count: 3 };

describe('BranchBreakdownTable', () => {
  it('renders nothing without a breakdown (one branch, or a single-branch scope)', () => {
    expect(renderToStaticMarkup(<BranchBreakdownTable title="By branch" total={{ owed: '80.00', count: 2 }} rows={undefined} metrics={metrics} />)).toBe('');
    expect(renderToStaticMarkup(<BranchBreakdownTable title="By branch" total={{ owed: '80.00', count: 2 }} rows={[rowA]} metrics={metrics} />)).toBe('');
  });

  it('lists each branch and shows the server total, not a client-side sum', () => {
    // A deliberately different total proves the footer is the server's figure.
    const html = renderToStaticMarkup(
      <BranchBreakdownTable title="By branch" total={{ owed: '240.00', count: 5 }} rows={[rowA, rowB]} metrics={metrics} />
    );
    expect(html).toContain('Main branch');
    expect(html).toContain('فرع صور');
    expect(html).toContain('dir="auto"');
    expect(html).toContain('80.00');
    expect(html).toContain('160.00');
    expect(html).toContain('All branches');
    expect(html).toMatch(/All branches<\/th><td[^>]*>240\.00<\/td><td[^>]*>5<\/td>/);
  });
});
