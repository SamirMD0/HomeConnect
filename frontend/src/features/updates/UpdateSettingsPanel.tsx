import { BilingualLabel } from '../../components/ui/BilingualLabel';
import toast from 'react-hot-toast';
import { useAuth } from '../../hooks/useAuth';
import type { UpdaterStatus } from '../../types/updater';
import { useUpdater } from './useUpdater';

const currentVersion = typeof __APP_VERSION__ === 'undefined' ? 'unknown' : __APP_VERSION__;

function statusLabel(status: UpdaterStatus, supported: boolean) {
  if (!supported) return { en: 'Unavailable', ar: 'غير متاح' };
  switch (status.state) {
    case 'checking': return { en: 'Checking…', ar: 'جارٍ الفحص…' };
    case 'available': return { en: `Update available (${status.version ?? 'unknown'})`, ar: `تحديث متاح (${status.version ?? 'غير معروف'})` };
    case 'downloading': return { en: `Downloading ${status.version ?? 'update'} — ${Math.round(status.progressPct ?? 0)}%`, ar: `جارٍ تنزيل التحديث — ${Math.round(status.progressPct ?? 0)}٪` };
    case 'ready': return { en: `Update ready (${status.version ?? 'unknown'})`, ar: `التحديث جاهز (${status.version ?? 'غير معروف'})` };
    case 'preparing': return { en: 'Saving the current version before updating…', ar: 'جارٍ حفظ الإصدار الحالي قبل التحديث…' };
    case 'error': return status.error === 'install-failed'
      ? { en: 'Update not installed. Your current version is still available.', ar: 'لم يتم تثبيت التحديث. الإصدار الحالي لا يزال متاحًا.' }
      : { en: 'Could not check for updates', ar: 'تعذّر التحقق من التحديثات' };
    default: return status.lastCheckedAt
      ? { en: 'Up to date', ar: 'التطبيق محدّث' }
      : { en: 'Not checked yet', ar: 'لم يتم الفحص بعد' };
  }
}

export function UpdateSettingsPanel() {
  const { user } = useAuth();
  const { status, supported, checkNow, installNow } = useUpdater();
  const admin = user?.role === 'ADMIN';
  const checkedAt = status.lastCheckedAt ? new Date(status.lastCheckedAt) : null;
  const lastChecked = checkedAt && !Number.isNaN(checkedAt.getTime()) ? checkedAt.toLocaleString() : '—';
  const handleInstall = async () => {
    const outcome = await installNow();
    if (!outcome.ok) toast(outcome.blocked.map((reason) => `• ${reason}`).join('\n') + '\nPlease finish, then try again. / يرجى الإنهاء ثم المحاولة مجددًا.', { icon: '⏳', duration: 4000 });
  };

  return (
    <section id="updates" className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
      {admin && <h2 className="mb-4 text-lg font-semibold text-slate-900">Updates</h2>}
      <dl className="grid gap-4 sm:grid-cols-2">
        <div>
          <dt className="text-sm font-medium text-slate-500"><BilingualLabel compact label={{ en: 'Current version', ar: 'الإصدار الحالي' }} /></dt>
          <dd className="mt-1 font-semibold text-slate-900">{currentVersion}</dd>
        </div>
        {admin && <>
          <div>
            <dt className="text-sm font-medium text-slate-500"><BilingualLabel compact label={{ en: 'Update status', ar: 'حالة التحديث' }} /></dt>
            <dd className="mt-1 font-semibold text-slate-900"><BilingualLabel compact label={statusLabel(status, supported)} /></dd>
          </div>
          <div>
            <dt className="text-sm font-medium text-slate-500"><BilingualLabel compact label={{ en: 'Last checked', ar: 'آخر فحص' }} /></dt>
            <dd className="mt-1 text-sm text-slate-700">{lastChecked}</dd>
          </div>
        </>}
      </dl>
      {admin && <div className="mt-5 flex flex-wrap gap-3">
        <button type="button" onClick={() => void checkNow()} disabled={!supported || status.state === 'checking'} className="rounded-md border border-emerald-600 px-3 py-2 text-sm font-medium text-emerald-700 hover:bg-emerald-50 disabled:cursor-not-allowed disabled:opacity-50">
          <BilingualLabel compact label={status.state === 'checking' ? { en: 'Checking…', ar: 'جارٍ الفحص…' } : { en: 'Check now', ar: 'فحص الآن' }} />
        </button>
        {status.state === 'ready' && <button type="button" onClick={() => void handleInstall()} className="rounded-md bg-emerald-700 px-3 py-2 text-sm font-medium text-white hover:bg-emerald-800">
          <BilingualLabel compact label={{ en: 'Install & Restart', ar: 'تثبيت وإعادة التشغيل' }} />
        </button>}
      </div>}
      {/* Release notes fetching is out of Phase 2 scope. */}
    </section>
  );
}
