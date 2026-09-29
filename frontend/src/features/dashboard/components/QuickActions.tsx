import { Link } from 'react-router-dom';
import { useAuth } from '../../../hooks/useAuth';
import { dashboardQuickActions } from '../config/module-registry';
import { BilingualLabel } from './layout/BilingualLabel';

/**
 * Compact pill row. Actions are distinct from metrics visually — smaller
 * height, wrap horizontally, no big card treatment — so a wall of 10 items
 * doesn't compete with the KPIs above.
 */
export function QuickActions() {
  const { user } = useAuth();
  const actions = dashboardQuickActions.filter((action) => !action.adminOnly || user?.role === 'ADMIN');
  return (
    <div className="flex flex-wrap gap-2">
      {actions.map((action) => {
        const Icon = action.icon;
        return (
          <Link
            key={action.key}
            to={action.route}
            className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-sm transition hover:-translate-y-px hover:border-emerald-300 hover:bg-emerald-50 hover:text-emerald-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/60"
          >
            <Icon className="h-3.5 w-3.5 shrink-0 text-emerald-600" aria-hidden="true" />
            <BilingualLabel label={action.label} compact />
          </Link>
        );
      })}
    </div>
  );
}
