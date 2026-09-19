import { printProductLabels, type LabelPageSize } from '../../products/utils/print-labels';

/**
 * Pricing cards use the same guarded Electron print IPC as legacy labels.
 * Sheet templates pass null so the browser/Electron print dialog owns the A4
 * or Letter surface; fixed cards pass their physical millimetre dimensions.
 */
export function printPricingCards(size: LabelPageSize | null) {
  return printProductLabels(size);
}
