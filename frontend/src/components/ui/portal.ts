import type React from 'react';
import { createPortal } from 'react-dom';

/**
 * Renders a full-window overlay (dialog, drawer, popup) into <body>.
 *
 * The app's glass content panel uses `backdrop-filter`, which makes it the
 * containing block for `position: fixed` descendants: an overlay rendered
 * inside it is positioned against the panel and clipped by its scroll area
 * instead of covering the window. Portalling to <body> escapes that.
 *
 * Without a DOM (server rendering, `renderToStaticMarkup` in tests) portals
 * cannot render, so the content is returned in place.
 */
export function portalToBody(content: React.ReactElement): React.ReactElement {
  return typeof document === 'undefined' ? content : createPortal(content, document.body);
}
