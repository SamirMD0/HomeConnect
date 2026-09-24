import { AlertTriangle } from 'lucide-react';
import type { PricingCardTemplate } from '../types/pricing-card.types';
import { canPrintLabelsDirectly } from '../../products/utils/print-labels';

/**
 * Thermal templates print through a much narrower pipeline than colour ones.
 * The barcode is drawn at a whole number of 203 dpi printer dots per module,
 * which only survives the round trip if the browser can hand the printer a
 * page at exactly the declared millimetres. In the desktop app that is
 * guaranteed — the main process calls `webContents.print` with the card
 * dimensions in microns. In a plain browser Chrome offers the driver's own
 * paper sizes, and the driver almost always wins: an 80 mm-wide XP-80T roll
 * shows up as `80 x 210 mm`, the 76 x 50 mm card lands in the top-left of a
 * 210 mm-long page, and the barcode module width drifts off-grid during the
 * driver's raster resample. The bars stop scanning even when the layout looks
 * fine on screen.
 *
 * Warn about it here — visibly, once, for the templates where it actually
 * matters — instead of leaving the operator to discover the failure at the
 * printer. The generic `BrowserPrintHint` above already covers margins and
 * scale; this one names the thermal-specific failure and points at the fix.
 */
export function ThermalPrintWarning({ template }: { template: PricingCardTemplate | undefined }) {
  const palette = template?.config?.appearance?.palette ?? 'color';
  if (palette !== 'thermal' || canPrintLabelsDirectly()) return null;

  return (
    <div role="alert" className="no-print flex items-start gap-3 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
      <AlertTriangle className="mt-0.5 h-5 w-5 flex-shrink-0" aria-hidden />
      <div className="space-y-1">
        <p className="font-semibold">Thermal template — browser print is unreliable.</p>
        <p>
          You are printing from a browser. Chrome cannot guarantee the exact page size a
          203 dpi thermal printer needs, and the barcode may not scan. Use the <b>Home Connect
          desktop app</b> instead — it prints thermal cards at their exact size in microns and
          the barcode always scans.
        </p>
        <p dir="rtl" lang="ar">
          هذا القالب حراري. الطباعة من المتصفح غير موثوقة لطابعات XP-80T (203 نقطة/بوصة)
          وقد لا يقرأ الباركود. استخدم تطبيق Home Connect لسطح المكتب للحصول على طباعة دقيقة.
        </p>
      </div>
    </div>
  );
}
