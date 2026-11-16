import { ReceiveScreen } from '../../../src/stock/ReceiveScreen';
import { CloudWriteGuard } from '../../../src/offline/CloudWriteGuard';
export default function Screen() { return <CloudWriteGuard><ReceiveScreen /></CloudWriteGuard>; }
