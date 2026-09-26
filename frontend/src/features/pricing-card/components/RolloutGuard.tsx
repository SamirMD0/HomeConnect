import type { ReactElement } from 'react';
import { Navigate, useLocation, useParams } from 'react-router-dom';
import { useRolloutMode } from '../hooks/useRolloutMode';

interface Props {
  /** Which surface this route belongs to. */
  surface: 'legacy' | 'pricing-card';
  /**
   * Where to send the user when the current mode blocks this surface. Accepts
   * either a fixed path or a function that receives the current path params
   * and search string, so single-product routes can hand off to their
   * pricing-card mirror without losing the product id.
   */
  fallback: string | ((context: { params: Record<string, string | undefined>; search: string }) => string);
  children: ReactElement;
}

export function RolloutGuard({ surface, fallback, children }: Props) {
  const rollout = useRolloutMode();
  const allowed = surface === 'legacy' ? rollout.legacyEnabled : rollout.pricingCardEnabled;
  const location = useLocation();
  const params = useParams();

  if (!allowed) {
    const to = typeof fallback === 'function' ? fallback({ params, search: location.search }) : fallback;
    return <Navigate to={to} replace state={{ from: location.pathname + location.search }} />;
  }
  return children;
}
