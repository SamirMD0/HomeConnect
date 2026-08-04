import React, { useState } from 'react';
import { FileDown } from 'lucide-react';
import toast from 'react-hot-toast';
import { LabelPaperSize } from '../utils/label-sheet-layout';

/**
 * Exports the label sheet as a PDF.
 *
 * In the desktop app this goes through Electron's `printToPDF`, which reuses the
 * print stylesheet and keeps the barcode vector. In a plain browser there is no
 * such API, so it falls back to the print dialog where "Save as PDF" is a
 * destination — the same output, one extra step, no bundled PDF library.
 */
export const ExportPdfButton: React.FC<{ disabled?: boolean; paper: LabelPaperSize; labelCount: number }> = ({ disabled, paper, labelCount }) => {
  const [busy, setBusy] = useState(false);

  const exportPdf = async () => {
    const exporter = window.electronAPI?.exportLabelsPdf;
    if (!exporter) {
      toast('Choose "Save as PDF" in the print dialog / اختر حفظ كملف PDF');
      window.print();
      return;
    }

    setBusy(true);
    try {
      const result = await exporter({ suggestedName: suggestedFileName(labelCount), paper });
      if (result.saved) toast.success('Labels exported / تم تصدير الملصقات');
      else if (result.error) toast.error(result.error);
    } catch {
      toast.error('PDF export failed / فشل تصدير الملف');
    } finally {
      setBusy(false);
    }
  };

  return (
    <button
      type="button"
      onClick={exportPdf}
      disabled={disabled || busy}
      className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
    >
      <FileDown className="h-4 w-4" />
      {busy ? 'Exporting… / جارٍ التصدير…' : 'Export PDF / تصدير PDF'}
    </button>
  );
};

function suggestedFileName(labelCount: number): string {
  const today = new Date().toISOString().slice(0, 10);
  return `product-labels-${today}-${labelCount}.pdf`;
}
