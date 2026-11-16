import { PrepaidCreateScreen } from '../../../../../src/prepaid/PrepaidCreateScreen';
import { CloudWriteGuard } from '../../../../../src/offline/CloudWriteGuard';
export default function Screen() { return <CloudWriteGuard><PrepaidCreateScreen /></CloudWriteGuard>; }
