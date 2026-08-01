import { Link } from 'react-router-dom';
import { useAuth } from '../../../hooks/useAuth';
import { dashboardQuickActions } from '../config/module-registry';
import { BilingualLabel } from './layout/BilingualLabel';

export function QuickActions() {
  const { user } = useAuth();
  const actions = dashboardQuickActions.filter((action) => !action.adminOnly || user?.role === 'ADMIN');
  return <div className="dashboard-quick-actions">{actions.map((action) => { const Icon = action.icon; return <Link key={action.key} to={action.route} className="dashboard-action-button"><Icon className="h-4 w-4 shrink-0" aria-hidden="true" /><BilingualLabel label={action.label} /></Link>; })}</div>;
}
