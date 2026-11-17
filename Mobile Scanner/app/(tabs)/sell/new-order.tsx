import { OrderScreen } from '../../../src/sales/OrderScreen';
import { CloudWriteGuard } from '../../../src/offline/CloudWriteGuard';
export default function Screen() { return <CloudWriteGuard><OrderScreen /></CloudWriteGuard>; }
