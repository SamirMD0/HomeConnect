import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { PricingCardsPage } from './PricingCardsPage';

function renderPage() {
  return renderToStaticMarkup(
    <MemoryRouter initialEntries={['/pricing-cards']}>
      <Routes><Route path="/pricing-cards" element={<PricingCardsPage />} /></Routes>
    </MemoryRouter>,
  );
}

describe('pricing cards section landing', () => {
  it('links to all four pricing card surfaces under the new section', () => {
    const markup = renderPage();

    for (const path of ['/pricing-cards/shop-profile', '/pricing-cards/feature-icons', '/pricing-cards/brand-logos', '/pricing-cards/templates']) {
      expect(markup).toContain(`href="${path}"`);
    }
  });

  it('keeps the four surfaces off the old settings paths', () => {
    expect(renderPage()).not.toContain('/settings/pricing-cards');
  });
});
