import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { DeltaChip, sparklineDeltaPercent } from './DeltaChip';

describe('DeltaChip', () => {
  it('shows emerald for a favourable up-move when higher is good', () => {
    const html = renderToStaticMarkup(<DeltaChip percent={12} goodDirection="up" />);
    expect(html).toContain('text-emerald-700');
    expect(html).toContain('12%');
    // Rising arrow present via lucide ArrowUpRight class
    expect(html).toContain('lucide-arrow-up-right');
  });

  it('shows red for an unfavourable up-move when lower is good (e.g. outstanding debt)', () => {
    const html = renderToStaticMarkup(<DeltaChip percent={8.2} goodDirection="down" />);
    expect(html).toContain('text-red-700');
    expect(html).toContain('8.2%');
  });

  it('collapses tiny deltas to a neutral 0% pill', () => {
    const html = renderToStaticMarkup(<DeltaChip percent={0.02} goodDirection="up" />);
    expect(html).toContain('0%');
    expect(html).toContain('text-slate-500');
  });

  it('renders nothing for a non-finite input', () => {
    const html = renderToStaticMarkup(<DeltaChip percent={NaN} goodDirection="up" />);
    expect(html).toBe('');
  });

  it('caps very large deltas at 999+%', () => {
    const html = renderToStaticMarkup(<DeltaChip percent={5000} goodDirection="up" />);
    expect(html).toContain('999+%');
  });
});

describe('sparklineDeltaPercent', () => {
  it('returns NaN for fewer than two points', () => {
    expect(Number.isNaN(sparklineDeltaPercent([]))).toBe(true);
    expect(Number.isNaN(sparklineDeltaPercent([{ value: 10 }]))).toBe(true);
  });

  it('computes the last-vs-previous percentage change', () => {
    expect(sparklineDeltaPercent([{ value: 100 }, { value: 125 }])).toBe(25);
    expect(sparklineDeltaPercent([{ value: 100 }, { value: 80 }])).toBe(-20);
  });

  it('handles money-shaped string values', () => {
    expect(sparklineDeltaPercent([{ value: '100.00' }, { value: '150.00' }])).toBe(50);
  });

  it('returns NaN when the baseline is zero (avoids infinity)', () => {
    expect(Number.isNaN(sparklineDeltaPercent([{ value: 0 }, { value: 10 }]))).toBe(true);
  });
});
