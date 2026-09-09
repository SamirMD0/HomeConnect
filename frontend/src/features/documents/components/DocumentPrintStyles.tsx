export function DocumentPrintStyles({ orientation = 'portrait' }: { orientation?: 'portrait' | 'landscape' }) {
  return <style>{`@media print { @page { size: A4 ${orientation}; margin: 12mm; } }`}</style>;
}
