import { AdjustScreen } from '../../../../src/stock/AdjustScreen';
import { CloudWriteGuard } from '../../../../src/offline/CloudWriteGuard';
export default function Screen() { return <CloudWriteGuard><AdjustScreen /></CloudWriteGuard>; }
