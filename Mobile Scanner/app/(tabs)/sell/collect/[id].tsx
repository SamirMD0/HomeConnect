import { PaymentScreen } from '../../../../src/sales/PaymentScreen';
import { CloudWriteGuard } from '../../../../src/offline/CloudWriteGuard';
export default function Screen() { return <CloudWriteGuard><PaymentScreen /></CloudWriteGuard>; }
