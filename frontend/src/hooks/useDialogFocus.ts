import { RefObject, useCallback, useEffect, useRef } from 'react';

const FOCUSABLE =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function nextDialogFocusIndex(input: {
  count: number;
  activeIndex: number;
  shiftKey: boolean;
  activeInsidePanel: boolean;
}): number | null {
  if (input.count === 0) return null;
  if (!input.activeInsidePanel) return 0;
  if (input.shiftKey && input.activeIndex <= 0) return input.count - 1;
  if (!input.shiftKey && input.activeIndex === input.count - 1) return 0;
  return null;
}

/**
 * Modal focus behaviour for a panel that is not a `Modal`.
 *
 * `Modal` implements this inline, but the product details drawer is a side
 * sheet with its own layout and cannot reuse it. Rather than let the drawer be
 * the one dialog in the app that leaks focus into the page behind it, the same
 * three guarantees live here:
 *
 *   * focus moves into the panel when it opens,
 *   * Tab and Shift+Tab cycle inside it,
 *   * focus returns to whatever opened it on close.
 *
 * Escape is left to the caller: the drawer already owns that key, and two
 * handlers racing to close the same panel is how a dialog ends up closing its
 * parent too.
 */
export function useDialogFocus(panelRef: RefObject<HTMLElement | null>, open: boolean) {
  const previouslyFocused = useRef<HTMLElement | null>(null);

  const getFocusable = useCallback(
    () => Array.from(panelRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? [])
      .filter((element) => element.offsetParent !== null || element === document.activeElement),
    [panelRef]
  );

  useEffect(() => {
    if (!open) return;
    previouslyFocused.current = document.activeElement as HTMLElement | null;
    return () => { previouslyFocused.current?.focus?.(); };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const frame = requestAnimationFrame(() => {
      const [first] = getFocusable();
      (first ?? panelRef.current)?.focus();
    });
    return () => cancelAnimationFrame(frame);
  }, [open, getFocusable, panelRef]);

  useEffect(() => {
    if (!open) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Tab') return;
      const focusable = getFocusable();
      if (focusable.length === 0) {
        event.preventDefault();
        panelRef.current?.focus();
        return;
      }
      const active = document.activeElement;
      const activeInsidePanel = active instanceof Node && Boolean(panelRef.current?.contains(active));
      const activeIndex = focusable.indexOf(active as HTMLElement);
      const nextIndex = nextDialogFocusIndex({
        count: focusable.length,
        activeIndex,
        shiftKey: event.shiftKey,
        activeInsidePanel,
      });
      if (nextIndex === null) return;
      event.preventDefault();
      focusable[nextIndex]?.focus();
    };

    document.addEventListener('keydown', onKeyDown, true);
    // The list behind a full-height sheet must not scroll with the wheel.
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKeyDown, true);
      document.body.style.overflow = previousOverflow;
    };
  }, [open, getFocusable, panelRef]);
}
