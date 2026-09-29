import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PricingCardRolloutMode } from '../types/pricing-card.types';
import { RolloutGuard } from './RolloutGuard';

const state = vi.hoisted(() => ({ mode: 'BOTH' as PricingCardRolloutMode }));
vi.mock('../hooks/useRolloutMode', () => ({
  useRolloutMode: () => ({
    mode: state.mode,
    legacyEnabled: state.mode === 'BOTH' || state.mode === 'LEGACY_ONLY',
    pricingCardEnabled: state.mode === 'BOTH' || state.mode === 'TEMPLATE_ONLY',
    isLoading: false,
  }),
}));

describe('RolloutGuard', () => {
  beforeEach(() => { state.mode = 'BOTH'; });

  it('renders the legacy surface in BOTH mode', () => {
    expect(render('legacy', '/products/x/label')).toContain('LEGACY');
  });

  it('renders the pricing-card surface in BOTH mode', () => {
    expect(render('card', '/products/x/pricing-card')).toContain('CARD');
  });

  it('does not render the pricing-card surface in LEGACY_ONLY mode', () => {
    state.mode = 'LEGACY_ONLY';
    const html = render('card', '/products/x/pricing-card');
    expect(html).not.toContain('CARD');
  });

  it('does not render the legacy surface in TEMPLATE_ONLY mode', () => {
    state.mode = 'TEMPLATE_ONLY';
    const html = render('legacy', '/products/x/label');
    expect(html).not.toContain('LEGACY');
  });
});

function render(_entry: 'legacy' | 'card', path: string) {
  return renderToStaticMarkup(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/products/:id/label" element={<RolloutGuard surface="legacy" fallback="/products/x/pricing-card"><span>LEGACY</span></RolloutGuard>} />
        <Route path="/products/:id/pricing-card" element={<RolloutGuard surface="pricing-card" fallback="/products/x/label"><span>CARD</span></RolloutGuard>} />
      </Routes>
    </MemoryRouter>,
  );
}
