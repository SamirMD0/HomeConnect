import { PurchasesScreen } from '../../../../../src/lookup/screens/PurchasesScreen';
import { CloudWifiGuard } from '../../../../../src/offline/CloudWriteGuard';
export default function Screen() { return <CloudWifiGuard><PurchasesScreen /></CloudWifiGuard>; }
