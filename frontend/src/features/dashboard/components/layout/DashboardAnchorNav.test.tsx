import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { DashboardAnchorNav } from './DashboardAnchorNav';

/**
 * These tests use SSR (no DOM), so we can only check the static markup:
 * roles, labels, semantic structure and default hidden state. The
 * IntersectionObserver + scroll behaviour is exercised in the visual
 * Playwright spec — jsdom doesn't ship a real IntersectionObserver.
 */
describe('DashboardAnchorNav', () => {
  beforeEach(() => {
    // React SSR shouldn't call these, but keep the mocks stable in case a
    // future refactor pulls the useEffect body earlier.
    vi.stubGlobal('IntersectionObserver', class { observe() {} unobserve() {} disconnect() {} });
  });

  it('renders every anchor label as a hash link', () => {
    const html = renderToStaticMarkup(
      <DashboardAnchorNav
        anchors={[
          { id: 'a-1', label: 'Alerts' },
          { id: 'a-2', label: 'Sales' },
          { id: 'a-3', label: 'Service' },
        ]}
      />
    );
    expect(html).toContain('href="#a-1"');
    expect(html).toContain('>Alerts<');
    expect(html).toContain('href="#a-2"');
    expect(html).toContain('>Sales<');
    expect(html).toContain('href="#a-3"');
    expect(html).toContain('>Service<');
  });

  it('carries a nav landmark with an accessible name', () => {
    const html = renderToStaticMarkup(
      <DashboardAnchorNav anchors={[{ id: 'a-1', label: 'Alerts' }]} />
    );
    expect(html).toMatch(/<nav[^>]*aria-label="Dashboard sections"/);
  });

  it('renders as an inline jump strip (no sticky positioning)', () => {
    const html = renderToStaticMarkup(
      <DashboardAnchorNav anchors={[{ id: 'a-1', label: 'Alerts' }]} />
    );
    expect(html).not.toContain('position: sticky');
    expect(html).not.toMatch(/class="[^"]*\bsticky\b[^"]*"/);
  });

  it('is hidden in print output via no-print', () => {
    const html = renderToStaticMarkup(
      <DashboardAnchorNav anchors={[{ id: 'a-1', label: 'Alerts' }]} />
    );
    expect(html).toContain('no-print');
  });
});
