import { useQuery } from '@tanstack/react-query';
import { formatMoney } from '@shared/money-format';
import { getReceivablesSummary } from '../api/receivables-api';
import { useLookup } from '../lookup/useLookup';
import { hiddenDashboardValue } from '../lookup/dashboard-privacy';
import { Badge } from '../ui/Badge';
import { HeroCard } from '../ui/Stats';

/**
 * Blue hero: total owed by customers, with the overdue amount underneath and
 * an overdue-customers pill. Opens Receivables. `hidden` follows the
 * hide-amounts eye on Home.
 */
export function ReceivablesCard({
  onPress,
  hidden = false,
}: {
  onPress: () => void;
  hidden?: boolean;
}) {
  const { client, key, session } = useLookup();
  const summary = useQuery({
    queryKey: key('receivables-summary'),
    queryFn: () => getReceivablesSummary(client),
    enabled: session.can('sell'),
  });
  if (!session.can('sell')) return null;
  const data = summary.data;
  const money = (value: string) => (hidden ? hiddenDashboardValue : formatMoney(value));
  return (
    <HeroCard
      label="Customers owe"
      value={data ? money(data.totalOutstanding) : summary.isError ? 'Not loaded' : '…'}
      caption={
        summary.isError
          ? 'Tap to open and retry'
          : data
            ? `${money(data.totalOverdue)} overdue · ${data.customersWithBalance} customers`
            : 'Loading'
      }
      trend={
        data && data.customersOverdue ? (
          <Badge tone="danger" icon="alert-circle" label={`${data.customersOverdue} late`} />
        ) : undefined
      }
      onPress={onPress}
    />
  );
}
