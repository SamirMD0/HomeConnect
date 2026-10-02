import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { Bell } from 'lucide-react';
import { LockedAction, TopBarActions, UserAvatar, WorkspaceSelector } from './TopBarActions';

describe('TopBarActions', () => {
  it('renders three locked actions: search, notifications, messages', () => {
    const html = renderToStaticMarkup(<TopBarActions />);
    expect(html).toContain('aria-label="Global search"');
    expect(html).toContain('aria-label="Notifications"');
    expect(html).toContain('aria-label="Messages"');
  });

  it('every locked action is disabled and carries a "coming soon" tooltip', () => {
    const html = renderToStaticMarkup(<TopBarActions />);
    const disabledCount = (html.match(/disabled=""/g) ?? []).length;
    const comingSoonCount = (html.match(/coming soon/g) ?? []).length;
    expect(disabledCount).toBeGreaterThanOrEqual(3);
    expect(comingSoonCount).toBeGreaterThanOrEqual(3);
  });
});

describe('LockedAction', () => {
  it('is disabled and carries the supplied label and hint', () => {
    const html = renderToStaticMarkup(
      <LockedAction label="Future thing" hint="Future thing is coming soon" icon={<Bell />} />,
    );
    expect(html).toContain('aria-label="Future thing"');
    expect(html).toContain('title="Future thing is coming soon"');
    expect(html).toContain('disabled=""');
  });
});

describe('WorkspaceSelector', () => {
  it('shows the provided business name and derives two-letter initials', () => {
    const html = renderToStaticMarkup(<WorkspaceSelector businessName="Falcon LLP" />);
    expect(html).toContain('Falcon LLP');
    expect(html).toContain('>FL<');
  });

  it('falls back to "Home Connect" with "HC" initials when no name is supplied', () => {
    const html = renderToStaticMarkup(<WorkspaceSelector />);
    expect(html).toContain('Home Connect');
    expect(html).toContain('>HC<');
  });

  it('is locked with a multi-shop tooltip', () => {
    const html = renderToStaticMarkup(<WorkspaceSelector businessName="Any Shop" />);
    expect(html).toContain('Multi-shop');
    expect(html).toContain('disabled=""');
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
