import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { PageJump } from './PageJump';
import { UserAvatar } from './TopBarActions';

vi.mock('../hooks/useAuth', () => ({
  useAuth: () => ({ user: { id: 'user-1', role: 'ADMIN', fullName: 'Sam Owner' } }),
}));

describe('PageJump', () => {
  it('renders a working, labelled search trigger', () => {
    const html = renderToStaticMarkup(
      <MemoryRouter>
        <PageJump />
      </MemoryRouter>,
    );
    expect(html).toContain('aria-label="Jump to a page"');
    expect(html).not.toContain('disabled=""');
  });
});

describe('UserAvatar', () => {
  it('renders the first initial of the full name', () => {
    const html = renderToStaticMarkup(<UserAvatar name="samir mardini" />);
    expect(html).toContain('>S<');
    expect(html).toContain('aria-label="Account: samir mardini"');
  });

  it('renders a question mark when no name is supplied', () => {
    const html = renderToStaticMarkup(<UserAvatar />);
    expect(html).toContain('>?<');
  });

  it('is NOT disabled (functional button, menu is for later)', () => {
    const html = renderToStaticMarkup(<UserAvatar name="samir" />);
    expect(html).not.toContain('disabled=""');
  });
});
