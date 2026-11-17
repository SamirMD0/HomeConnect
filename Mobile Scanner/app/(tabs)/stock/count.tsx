import { CountScreen } from '../../../src/stock/CountScreen';
import { CloudWriteGuard } from '../../../src/offline/CloudWriteGuard';
export default function Screen() { return <CloudWriteGuard><CountScreen /></CloudWriteGuard>; }
