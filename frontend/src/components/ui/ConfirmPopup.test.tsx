import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { ConfirmPopupContent } from './ConfirmPopup';

describe('ConfirmPopup', () => {
  it('shows the question with Confirm and Cancel, and needs no typing or password', () => {
    const html = renderToStaticMarkup(
      <ConfirmPopupContent
        title="Merge customers?"
        message={'First line\nSecond line'}
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />
    );
    expect(html).toContain('role="alertdialog"');
    expect(html).toContain('Merge customers?');
    expect(html).toContain('whitespace-pre-line');
    expect(html).toContain('Confirm');
    expect(html).toContain('Cancel');
    expect(html).not.toContain('<input');
  });
  it('sits above an open Modal', () => {
    const html = renderToStaticMarkup(
      <ConfirmPopupContent title="t" message="m" onConfirm={vi.fn()} onCancel={vi.fn()} />
    );
    expect(html).toContain('z-[60]');
  });
});
