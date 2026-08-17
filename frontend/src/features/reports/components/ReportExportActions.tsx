import { Download, Printer } from 'lucide-react';
import toast from 'react-hot-toast';

/**
 * Per-report export. There is deliberately no "export everything" control
 * anywhere in Reports: each report exports itself and nothing else.
 *
 * PDF is produced through the browser's own print dialog ("Save as PDF"), not a
 * client-side PDF library. The reports are bilingual and carry Arabic customer
 * and product names; jsPDF's built-in fonts have no Arabic glyphs and no RTL
 * shaping, so a generated PDF would silently mangle exactly the names a shop
 * owner needs to read. The browser already renders those correctly, so printing
 * is both the safer and the higher-fidelity route — and it adds no dependency.
 *
 * Scoping is structural rather than conditional: a report detail page renders
 * one report, so printing the page prints that report alone.
 */
export function ReportExportActions({ onExportCsv }: { onExportCsv?: () => Promise<void> }) {
  const exportCsv = async () => {
    if (!onExportCsv) return;
    try {
      await onExportCsv();
    } catch {
      toast.error('CSV export failed / تعذر تصدير CSV');
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-2 print:hidden">
      {onExportCsv && (
        <button
          type="button"
          onClick={() => void exportCsv()}
          className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
        >
          <Download className="h-4 w-4" />
          Export CSV / تصدير CSV
        </button>
      )}
      <button
        type="button"
        onClick={() => window.print()}
        title="Opens the print dialog — choose “Save as PDF” as the destination"
        className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700"
      >
        <Printer className="h-4 w-4" />
        Export PDF / تصدير PDF
      </button>
    </div>
  );
}
