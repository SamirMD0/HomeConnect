import { Link } from 'react-router-dom';
import { HandCoins, Plus, ScanLine } from 'lucide-react';
import { BilingualLabel } from '../../../../components/ui/BilingualLabel';
import { BrandArt } from '../../../../components/ui/BrandArt';
import { buttonClasses } from '../../../../components/ui/Button';
import { formatMoney } from '../../../customer-financial/utils/financial-format';
import type { SalesAnalyticsData } from '../../types';

function countLabel(count: number, singular: string, plural: string): string {
  return `${count} ${count === 1 ? singular : plural}`;
}

/**
 * The page's one colour moment: today's sales, and the three things staff do
 * next. Green because this is money in, blue for the actions, as everywhere else.
 */
export function TodayBanner({ totals }: { totals?: SalesAnalyticsData['totals'] }) {
  return (
    <section
      aria-label="Today's sales"
      className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-emerald-100 via-sky-50 to-brand-100 p-6 sm:p-8"
    >
      <BrandArt className="pointer-events-none absolute -bottom-3 right-4 hidden w-[19rem] text-brand-400 md:block" />
      <div className="relative max-w-lg">
        <h2 className="text-[1.625rem] font-bold leading-tight tracking-tight text-emerald-800">
          {totals ? `${formatMoney(totals.salesToday)} sold today` : 'Today’s sales'}
        </h2>
        {totals && (
          <p className="mt-2 text-sm font-medium text-emerald-800">
            {countLabel(totals.ordersToday, 'order', 'orders')} ·{' '}
            {countLabel(totals.pendingDelivery, 'delivery', 'deliveries')} pending ·{' '}
            {countLabel(totals.unpaidOrders, 'order', 'orders')} unpaid
          </p>
        )}
        <div className="mt-6 flex flex-wrap items-center gap-2">
          <Link to="/sales-orders?new=1" className={buttonClasses('primary', 'lg')}>
            <Plus className="h-4 w-4" aria-hidden="true" />
            <BilingualLabel label={{ en: 'New sale', ar: 'بيع جديد' }} compact />
          </Link>
          <Link to="/receivables" className={buttonClasses('secondary', 'lg')}>
            <HandCoins className="h-4 w-4" aria-hidden="true" />
            <BilingualLabel label={{ en: 'Record payment', ar: 'تسجيل دفعة' }} compact />
          </Link>
          <Link to="/scanner" className={buttonClasses('secondary', 'lg')}>
            <ScanLine className="h-4 w-4" aria-hidden="true" />
            <BilingualLabel label={{ en: 'Scan', ar: 'مسح' }} compact />
          </Link>
        </div>
      </div>
    </section>
  );
}
