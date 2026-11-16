import { CloudWifiGuard } from '../../../../../src/offline/CloudWriteGuard';
import { StatementScreen } from '../../../../../src/lookup/screens/StatementScreen';
export default function CustomerStatement() {
  return <CloudWifiGuard><StatementScreen party="customer" /></CloudWifiGuard>;
}
