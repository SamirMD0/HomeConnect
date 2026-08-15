import React, { useEffect, useMemo, useState } from 'react';
import { ScanLine } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { Modal } from '../../components/ui/Modal';
import { ProductPreviewPanel } from '../../features/products/components/ProductPreviewPanel';
import { MobileScannerPanel } from '../../features/scanner/components/MobileScannerPanel';
import { RecentScansList } from '../../features/scanner/components/RecentScansList';
import { ScanFeedback } from '../../features/scanner/components/ScanFeedback';
import { ScannerSessionsList } from '../../features/scanner/components/ScannerSessionsList';
import { useRecentScans } from '../../features/scanner/hooks/useRecentScans';
import {
  useCreatePairingCode, useDisableLan, useEnableLan, useLanStatus, useRevokeSession, useScannerSessions,
} from '../../features/scanner/hooks/useScannerAdmin';
import { useScannerEvents } from '../../features/scanner/hooks/useScannerEvents';
import { useScannerLookup } from '../../features/scanner/hooks/useScannerLookup';
import { PairingCode } from '../../features/scanner/types/scanner.types';
import type { ScanLookupResult } from '../../features/scanner/types/scanner.types';
import { toRecentScanFromEvent } from '../../features/scanner/utils/scan-events';
import { canManageScanner } from '../../features/scanner/utils/scanner-admin';
import { businessLabels } from '../../shared/labels/business-labels';
import { useAuth } from '../../hooks/useAuth';

const labels = businessLabels.scanner;

export const previewForDeskScan = (result: ScanLookupResult): ScanLookupResult | null =>
  result.status === 'FOUND' && result.product ? result : null;

export const scannerOrderRouteState = (productId: string) => ({ prefillOrderProductId: productId });

/**
 * Only seeds the receiving form when the product is actually receivable, so a
 * product still awaiting its opening count opens an empty form rather than one
 * carrying a line the form would refuse.
 */
export const scannerReceivingRouteState = (productId: string, canPrefill: boolean) =>
  canPrefill ? { prefillReceivingProductId: productId } : undefined;

export const ScannerHubPage: React.FC = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const canManage = canManageScanner(user?.role);

  const lanStatus = useLanStatus();
  const sessions = useScannerSessions();
  const enableLan = useEnableLan();
  const disableLan = useDisableLan();
  const createCode = useCreatePairingCode();
  const revoke = useRevokeSession();

  const [pairingCode, setPairingCode] = useState<PairingCode | null>(null);
  const [confirmDisable, setConfirmDisable] = useState(false);
  const [revokingId, setRevokingId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  // What the preview panel is showing: the latest desk scan, or an earlier scan
  // the user reopened from the history.
  const [preview, setPreview] = useState<{ productId: string; alsoMatchedSku?: boolean } | null>(null);

  // Drives the pairing countdown. A second is the coarsest tick that still
  // reads as counting down.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!pairingCode) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [pairingCode]);

  const recentScans = useRecentScans();
  const scanner = useScannerLookup({
    onScanRecorded: recentScans.add,
    onFound: (result) => {
      const found = previewForDeskScan(result);
      if (found?.product) setPreview({ productId: found.product.id, alsoMatchedSku: found.alsoMatchedSku });
    },
    // Typed text that is not a code falls through to the product catalogue
    // rather than being reported as an unreadable scan.
    onSearch: (term) => navigate(`/products?search=${encodeURIComponent(term)}`),
  });

  // The hub is the one place that shows phone scans as they happen, so polling
  // runs whenever it is open rather than behind a mode toggle.
  useScannerEvents({
    enabled: true,
    canOpenProduct: false,
    onPhoneScan: (event) => recentScans.add(toRecentScanFromEvent(event)),
  });

  const status = lanStatus.data;
  const sessionList = useMemo(() => sessions.data ?? [], [sessions.data]);

  const generateCode = () => {
    createCode.mutate(undefined, {
      onSuccess: (code) => { setPairingCode(code); setNow(Date.now()); },
      onError: () => toast.error('Could not generate a pairing code / تعذر إنشاء رمز الربط'),
    });
  };

  const doDisable = () => {
    disableLan.mutate(undefined, {
      onSuccess: () => {
        setPairingCode(null);
        setConfirmDisable(false);
        toast.success('Mobile scanner turned off / تم إيقاف ماسح الهاتف');
      },
      onError: () => toast.error('Could not turn off the mobile scanner / تعذر الإيقاف'),
    });
  };

  const doRevoke = (id: string) => {
    setRevokingId(id);
    revoke.mutate(id, {
      onSuccess: () => toast.success('Device disconnected / تم فصل الجهاز'),
      onError: () => toast.error('Could not revoke the device / تعذر إلغاء الجهاز'),
      onSettled: () => setRevokingId(null),
    });
  };

  return <div className="space-y-5">
    <header>
      <div className="flex items-center gap-3">
        <ScanLine className="h-7 w-7 text-emerald-600" />
        <h1 className="text-2xl font-bold text-slate-900">{labels.hub}</h1>
      </div>
      <p className="mt-1 text-sm text-slate-500">{labels.hubSubtitle}</p>
    </header>

    <section className="rounded-lg border border-slate-200 bg-white p-4">
      <label className="block">
        <span className="text-xs font-semibold text-slate-600">{labels.scanProduct}</span>
        <input
          value={search}
          autoFocus
          onChange={(event) => { setSearch(event.target.value); scanner.clear(); }}
          onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); scanner.submit(search); setSearch(''); } }}
          placeholder="Scan barcode or SKU / امسح الباركود أو رمز المنتج"
          className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm"
        />
      </label>
      <div className="mt-3">
        <ScanFeedback
          result={scanner.result}
          isLooking={scanner.isLooking}
          isError={scanner.isError}
          onOpenProduct={(id) => setPreview({ productId: id })}
          onManualSearch={() => navigate(`/products?search=${encodeURIComponent(scanner.result?.normalizedCode ?? '')}`)}
        />
      </div>
    </section>

    <ProductPreviewPanel
      productId={preview?.productId ?? null}
      alsoMatchedSku={preview?.alsoMatchedSku}
      onClear={() => setPreview(null)}
      onOpenProduct={(id) => navigate(`/products?focus=${id}`)}
      onMakeOrder={(id) => navigate('/sales-orders', { state: scannerOrderRouteState(id) })}
      onReceiveStock={(id, canPrefill) => navigate('/inventory/receiving/new', { state: scannerReceivingRouteState(id, canPrefill) })}
    />

    <div className="grid gap-5 lg:grid-cols-2">
      <MobileScannerPanel
        status={status}
        isLoading={lanStatus.isLoading}
        canManage={canManage}
        pairingCode={pairingCode}
        isEnabling={enableLan.isPending}
        isGeneratingCode={createCode.isPending}
        onEnable={() => enableLan.mutate(undefined, { onError: () => toast.error('Could not turn on the mobile scanner / تعذر التشغيل') })}
        onRequestDisable={() => setConfirmDisable(true)}
        onGenerateCode={generateCode}
        now={now}
      />
      <ScannerSessionsList
        sessions={sessionList}
        canManage={canManage}
        onRevoke={doRevoke}
        revokingId={revokingId}
        now={now}
      />
    </div>

    <RecentScansList
      scans={recentScans.scans}
      onPreview={(id) => setPreview({ productId: id })}
      onOpenProduct={(id) => navigate(`/products?focus=${id}`)}
      onClear={recentScans.clear}
    />

    <Modal isOpen={confirmDisable} onClose={() => setConfirmDisable(false)} title={labels.disableLanTitle} size="sm">
      <div className="space-y-4">
        <p className="text-sm text-slate-600">{labels.disableLanWarning}</p>
        <div className="flex justify-end gap-2">
          <button type="button" onClick={() => setConfirmDisable(false)} className="rounded-lg border px-4 py-2 text-sm">
            {businessLabels.common.cancel}
          </button>
          <button type="button" onClick={doDisable} disabled={disableLan.isPending} className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
            {labels.disableLan}
          </button>
        </div>
      </div>
    </Modal>
  </div>;
};
