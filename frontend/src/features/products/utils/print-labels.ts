export interface LabelPageSize { widthMm: number; heightMm: number }

/**
 * Prints the labels on the page.
 *
 * In the desktop app, a fixed label size goes through the main process, which
 * prints one label per page at exactly that size with no margins and no
 * URL/date header (see desktop/src/label-print.ts). Without a fixed size (auto
 * fit, A4 sheets), or in a plain browser, it falls back to the print dialog.
 */
export async function printProductLabels(size: LabelPageSize | null): Promise<{ printed: boolean; error?: string }> {
  const bridge = typeof window !== 'undefined' ? window.electronAPI?.printLabels : undefined;
  if (!bridge || !size) {
    window.print();
    return { printed: true };
  }
  try {
    return await bridge(size);
  } catch (error) {
    return { printed: false, error: error instanceof Error ? error.message : 'Printing failed' };
  }
}

export function canPrintLabelsDirectly(): boolean {
  return typeof window !== 'undefined' && Boolean(window.electronAPI?.printLabels);
}
