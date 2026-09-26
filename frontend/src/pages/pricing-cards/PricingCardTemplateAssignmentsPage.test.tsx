import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { assignmentCategories, PricingCardTemplateAssignmentsPage, sameAssignments } from './PricingCardTemplateAssignmentsPage';

vi.mock('../../hooks/useAuth', () => ({ useAuth: () => ({ user: { id: 'admin', role: 'ADMIN' } }) }));
vi.mock('../../features/pricing-card/hooks/useShopProfile', () => ({
  useShopProfile: () => ({ data: { categoryDefaultTemplates: { TV: 'template-tv', Appliance: null } }, isLoading: false, isError: false }),
  useUpdateShopProfile: () => ({ mutate: vi.fn(), isPending: false }),
}));
vi.mock('../../features/pricing-card/hooks/usePricingCardTemplates', () => ({
  usePricingCardTemplates: () => ({ data: [{ id: 'template-tv', name: 'TV Large' }, { id: 'template-shelf', name: 'Shelf Card' }], isLoading: false, isError: false }),
}));
vi.mock('../../features/pricing/hooks/usePricingPresets', () => ({
  usePricingPresets: () => ({ data: { items: [{ productType: 'TV' }, { productType: 'Washer' }] }, isLoading: false, isError: false }),
}));

describe('pricing-card template assignments page', () => {
  it('renders one assignment row per configured or preset product type and requires a password', () => {
    const html = renderToStaticMarkup(<MemoryRouter><PricingCardTemplateAssignmentsPage /></MemoryRouter>);
    expect(html).toContain('Template assignments');
    expect(html).toContain('TV');
    expect(html).toContain('Appliance');
    expect(html).toContain('Washer');
    expect(html).toContain('TV Large');
    expect(html).toContain('Account password');
    expect(html).toContain('Save assignments');
  });

  it('deduplicates sorted categories and compares explicit null with an omitted fallback', () => {
    expect(assignmentCategories({ Washer: null }, [{ productType: 'TV' }, { productType: 'Washer' }, { productType: null }]))
      .toEqual(['TV', 'Washer']);
    expect(sameAssignments({ TV: null }, {})).toBe(true);
    expect(sameAssignments({ TV: 'template-tv' }, { TV: null })).toBe(false);
  });
});
