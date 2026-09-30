import { Download, RefreshCw } from 'lucide-react';
import { Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import { BilingualLabel } from '../../components/ui/BilingualLabel';
import { useAuth } from '../../hooks/useAuth';
import { useUpdater } from './useUpdater';

const chipClass = 'mx-2 mb-2 flex w-[calc(100%-1rem)] items-center gap-2 rounded-md border border-emerald-400/20 bg-emerald-500/10 px-2.5 py-2 text-left text-xs font-medium text-emerald-200';

export function UpdateChip() {
  const { user } = useAuth();
  const { status, supported, installNow } = useUpdater();
  if (user?.role !== 'ADMIN' || !supported) return null;

  const handleInstall = async () => {
    const outcome = await installNow();
    if (!outcome.ok) toast(outcome.blocked.map((reason) => `• ${reason}`).join('\n') + '\nPlease finish, then try again. / يرجى الإنهاء ثم المحاولة مجددًا.', { icon: '⏳', duration: 4000 });
  };

  if (status.state === 'ready') {
    return (
      <button type="button" onClick={() => void handleInstall()} className={chipClass}>
        <RefreshCw className="h-4 w-4 shrink-0" aria-hidden="true" />
        <BilingualLabel label={{ en: 'Update ready · Restart', ar: 'التحديث جاهز · إعادة التشغيل' }} />
      </button>
    );
  }

  if (status.state !== 'available' && status.state !== 'downloading') return null;

  const label = {
    en: `Update available: ${status.version ?? 'unknown'}${status.state === 'downloading' ? ` — ${Math.round(status.progressPct ?? 0)}%` : ''}`,
    ar: `تحديث متاح: ${status.version ?? 'غير معروف'}${status.state === 'downloading' ? ` — ${Math.round(status.progressPct ?? 0)}٪` : ''}`,
  };
  const contents = <><Download className="h-4 w-4 shrink-0" aria-hidden="true" /><BilingualLabel label={label} /></>;

  return status.state === 'available'
    ? <Link to="/settings#updates" className={chipClass}>{contents}</Link>
    : <div className={chipClass}>{contents}</div>;
}
