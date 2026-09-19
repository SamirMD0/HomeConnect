import React from 'react';
import { canPrintLabelsDirectly } from '../utils/print-labels';

/**
 * The desktop app prints labels at their exact size by itself. A plain browser
 * cannot be told to, so say which print-dialog settings avoid the extra paper
 * and the page address printed on the label.
 */
export const BrowserPrintHint: React.FC = () => {
  if (canPrintLabelsDirectly()) return null;
  return (
    <p role="note" className="no-print rounded-lg border border-sky-200 bg-sky-50 p-3 text-sm text-sky-900">
      Printing from a browser: in the print dialog open <b>More settings</b>, untick <b>Headers and footers</b>, set <b>Margins</b> to <b>None</b> and <b>Scale</b> to <b>100</b>.
      The desktop app does this automatically. / عند الطباعة من المتصفح: ألغِ «الرؤوس والتذييلات»، واجعل الهوامش «بلا» والمقياس 100.
    </p>
  );
};
