import { FileDown, Printer } from 'lucide-react';
import { useState } from 'react';
import toast from 'react-hot-toast';
import { Button } from '../../../components/ui';
import type { DocumentPdfOptions } from '../types/document.types';

export function DocumentActions({ disabled = false, fileName }: { disabled?: boolean; fileName: string }) {
  const [exporting, setExporting] = useState(false);
  const exportPdf = async () => {
    const options: DocumentPdfOptions = { suggestedName: fileName, paper: 'A4', orientation: 'portrait' };
    const exporter = window.electronAPI?.exportDocumentPdf;
    if (!exporter) {
      toast('Choose "Save as PDF" in the print dialog / اختر حفظ كملف PDF');
      window.print();
      return;
    }
    setExporting(true);
    try {
      const result = await exporter(options);
      if (result.saved) toast.success('PDF exported / تم تصدير الملف');
      else if (result.error) toast.error(result.error);
    } catch {
      toast.error('PDF export failed / فشل تصدير الملف');
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="no-print flex flex-wrap gap-2">
      <Button variant="secondary" icon={<FileDown />} disabled={disabled} isLoading={exporting} onClick={() => void exportPdf()}>
        Export PDF / تصدير PDF
      </Button>
      <Button icon={<Printer />} disabled={disabled} onClick={() => window.print()}>
        Print / طباعة
      </Button>
    </div>
  );
}
