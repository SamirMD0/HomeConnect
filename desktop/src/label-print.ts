import type { WebContentsPrintOptions } from 'electron';

export const LABEL_PRINT_CHANNEL = 'labels:print';

export interface LabelPrintRequest { widthMm: number; heightMm: number }
export interface LabelPrintResult { printed: boolean; error?: string }

/** Physical bounds accepted by both legacy labels and the larger card templates. */
const MIN_MM = 20;
const MAX_MM = 210;

/**
 * Print options for one label per page on the thermal roll.
 *
 * Through the browser's `window.print()` the page size, margins and the
 * URL/date header are whatever the print dialog last used — on the 80 mm roll
 * that fed half a metre of paper and printed `localhost:3002` on the label.
 * Printing from the main process fixes all three: the page is exactly the
 * label (Electron takes microns), there is no margin, no header or footer is
 * ever added (Electron prints none unless asked), and nothing is scaled.
 */
export function labelPrintOptions(request: unknown): WebContentsPrintOptions {
  const { widthMm, heightMm } = (request ?? {}) as Partial<LabelPrintRequest>;
  for (const [name, value] of [['width', widthMm], ['height', heightMm]] as const) {
    if (typeof value !== 'number' || !Number.isFinite(value) || value < MIN_MM || value > MAX_MM) {
      throw new Error(`Label ${name} must be between ${MIN_MM} and ${MAX_MM} mm`);
    }
  }
  return {
    silent: false,
    printBackground: true,
    landscape: false,
    margins: { marginType: 'none' },
    pageSize: { width: Math.round(widthMm! * 1000), height: Math.round(heightMm! * 1000) },
    scaleFactor: 100,
  };
}

interface PrintableContents {
  print(options: WebContentsPrintOptions, callback: (success: boolean, failureReason: string) => void): void;
}

export function printLabels(contents: PrintableContents, request: unknown): Promise<LabelPrintResult> {
  let options: WebContentsPrintOptions;
  try {
    options = labelPrintOptions(request);
  } catch (error) {
    return Promise.resolve({ printed: false, error: error instanceof Error ? error.message : 'Invalid label size' });
  }
  return new Promise((resolve) => {
    contents.print(options, (success, failureReason) => {
      // Closing the dialog is an ordinary outcome, not an error.
      if (success || failureReason === 'cancelled') resolve({ printed: success });
      else resolve({ printed: false, error: failureReason || 'Printing failed' });
    });
  });
}
