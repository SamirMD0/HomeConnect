import { useEffect, useId, useRef, useState } from 'react';
import { Badge, Button, Modal } from '../../../components/ui';
import { supplierBillsApi, type BillFilter, type SupplierBill } from '../api/supplier-bills.api';
import { supplierPurchasesApi } from '../api/supplier-purchases.api';
import type { SupplierPurchase } from '../types/supplier-purchase.types';

function useBillImage(bill: SupplierBill) {
  const [state, setState] = useState<{ url?: string; error?: string }>({});
  useEffect(() => {
    let active = true;
    let objectUrl: string | undefined;
    setState({});
    void supplierBillsApi
      .image(bill)
      .then((blob) => {
        if (!active) return;
        objectUrl = URL.createObjectURL(blob);
        setState({ url: objectUrl });
      })
      .catch((error: Error) => {
        if (active) setState({ error: error.message });
      });
    return () => {
      active = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [bill]);
  return state;
}
function BillThumbnail({ bill, onOpen }: { bill: SupplierBill; onOpen: () => void }) {
  const { url, error } = useBillImage(bill);
  return (
    <Button
      variant="ghost"
      className="h-40 w-full overflow-hidden bg-slate-50 p-2"
      onClick={onOpen}
      aria-label={`Open bill from ${new Date(bill.capturedAt).toLocaleDateString('en-GB')}`}
    >
      {url ? (
        <img
          src={url}
          alt="Supplier bill page"
          loading="lazy"
          className="h-full w-full object-contain"
        />
      ) : (
        <span className="whitespace-normal">{error ?? 'Loading image…'}</span>
      )}
    </Button>
  );
}
function BillLightbox({ bill, onClose }: { bill: SupplierBill; onClose: () => void }) {
  const { url, error } = useBillImage(bill);
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);
  const viewport = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(700);
  const [aspect, setAspect] = useState(1.4);
  useEffect(() => {
    const measure = () => {
      if (viewport.current) setWidth(Math.max(100, viewport.current.clientWidth - 32));
    };
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, []);
  const imageWidth = width * zoom;
  const imageHeight = imageWidth * aspect;
  return (
    <Modal isOpen title="Supplier bill" size="xl" onClose={onClose}>
      <div className="flex flex-wrap items-center gap-2 pb-3">
        <Button
          variant="secondary"
          onClick={() => setZoom((value) => Math.min(4, value + 0.25))}
          disabled={zoom >= 4}
        >
          Zoom in
        </Button>
        <Button
          variant="secondary"
          onClick={() => setZoom((value) => Math.max(0.25, value - 0.25))}
          disabled={zoom <= 0.25}
        >
          Zoom out
        </Button>
        <Button variant="secondary" onClick={() => setRotation((value) => (value + 90) % 360)}>
          Rotate
        </Button>
        <Button
          variant="secondary"
          onClick={() => {
            setRotation(0);
            setZoom(1);
          }}
        >
          Reset view
        </Button>
        {url && (
          <a
            className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-brand-700"
            href={url}
            download={`supplier-bill-${bill.id}.${bill.mime === 'image/png' ? 'png' : bill.mime === 'image/jpeg' ? 'jpg' : bill.mime.split('/')[1]}`}
          >
            Download
          </a>
        )}
        <span className="text-sm" aria-live="polite">
          {Math.round(zoom * 100)}%
        </span>
      </div>
      {error && <p role="alert">{error}</p>}
      <div
        ref={viewport}
        className="max-h-[65vh] overflow-auto rounded-lg bg-slate-100 p-4"
        tabIndex={0}
        role="region"
        aria-label="Bill image, scroll to pan"
      >
        {url ? (
          <div
            className="relative mx-auto"
            style={{
              width: rotation % 180 ? imageHeight : imageWidth,
              height: rotation % 180 ? imageWidth : imageHeight,
            }}
          >
            <img
              src={url}
              alt="Full size supplier bill"
              className="absolute left-1/2 top-1/2 max-w-none"
              onLoad={(event) =>
                setAspect(event.currentTarget.naturalHeight / event.currentTarget.naturalWidth)
              }
              style={{
                width: imageWidth,
                height: imageHeight,
                transform: `translate(-50%, -50%) rotate(${rotation}deg)`,
              }}
            />
          </div>
        ) : (
          !error && <p role="status">Loading full size image…</p>
        )}
      </div>
      {bill.note && <p className="mt-3 whitespace-pre-wrap text-sm">{bill.note}</p>}
    </Modal>
  );
}

export function SupplierBills({
  supplierId,
  receivingId,
}: {
  supplierId?: string;
  receivingId?: string;
}) {
  const purchasePickerId = useId();
  const [filter, setFilter] = useState<BillFilter>('false');
  const [bills, setBills] = useState<SupplierBill[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [revision, setRevision] = useState(0);
  const [opened, setOpened] = useState<SupplierBill | null>(null);
  const [linking, setLinking] = useState<SupplierBill | null>(null);
  const [purchases, setPurchases] = useState<SupplierPurchase[]>([]);
  const [purchasePage, setPurchasePage] = useState(1);
  const [purchasePages, setPurchasePages] = useState(1);
  const [choice, setChoice] = useState('');
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    const load = receivingId
      ? supplierBillsApi.forPurchase(receivingId)
      : supplierBillsApi.list(supplierId!, filter);
    void load
      .then((rows) => {
        if (active) setBills(rows);
      })
      .catch((failure: Error) => {
        if (active) setError(failure.message);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [supplierId, receivingId, filter, revision]);
  useEffect(() => {
    if (!linking) return;
    let active = true;
    setSaving(true);
    void supplierPurchasesApi
      .list(linking.supplierId, purchasePage, 50)
      .then((result) => {
        if (active) {
          setPurchases(result.items);
          setPurchasePages(result.pagination.totalPages);
        }
      })
      .catch((failure: Error) => {
        if (active) setError(failure.message);
      })
      .finally(() => {
        if (active) setSaving(false);
      });
    return () => {
      active = false;
    };
  }, [linking, purchasePage]);
  const link = async () => {
    if (!linking || !choice) return;
    setSaving(true);
    setError(null);
    try {
      await supplierBillsApi.link(linking, choice);
      setLinking(null);
      setRevision((value) => value + 1);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Could not link bill.');
    } finally {
      setSaving(false);
    }
  };
  return (
    <section
      className="space-y-3 rounded-lg border bg-white p-4"
      aria-label={receivingId ? 'Attached bills' : 'Bills'}
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 font-bold">
          {receivingId ? 'Attached bills' : 'Bills'} <Badge>{bills.length}</Badge>
        </h2>
        <div className="flex flex-wrap items-center gap-3">
          {!receivingId && (
            <label className="text-sm font-semibold">
              Show bills{' '}
              <select
                className="ml-2 rounded-lg border border-slate-300 bg-white px-3 py-2"
                value={filter}
                onChange={(event) => setFilter(event.target.value as BillFilter)}
              >
                <option value="false">Unlinked</option>
                <option value="true">Linked</option>
                <option value="all">All</option>
              </select>
            </label>
          )}
          <Button variant="secondary" onClick={() => setRevision((value) => value + 1)}>
            Refresh
          </Button>
        </div>
      </div>
      {error && (
        <p role="alert" className="text-sm text-red-700">
          {error}
        </p>
      )}
      {loading ? (
        <p role="status">Loading bills…</p>
      ) : !bills.length ? (
        <p className="text-sm text-slate-500">No bills to show.</p>
      ) : (
        <div
          className={
            receivingId
              ? 'flex gap-3 overflow-x-auto pb-2'
              : 'grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4'
          }
        >
          {bills.map((bill) => (
            <article
              key={bill.id}
              className={`space-y-2 rounded-lg border border-slate-200 p-3 ${receivingId ? 'w-48 shrink-0' : ''}`}
            >
              <BillThumbnail bill={bill} onOpen={() => setOpened(bill)} />
              <p className="text-xs text-slate-500">
                {new Date(bill.capturedAt).toLocaleString('en-GB')}
              </p>
              <Badge tone={bill.supplierReceivingId ? 'success' : 'neutral'}>
                {bill.supplierReceivingId ? 'Linked' : 'Unlinked'}
              </Badge>
              {bill.note && <p className="line-clamp-3 whitespace-pre-wrap text-sm">{bill.note}</p>}
              {!bill.supplierReceivingId && (
                <Button
                  variant="secondary"
                  onClick={() => {
                    setChoice('');
                    setPurchases([]);
                    setPurchasePage(1);
                    setLinking(bill);
                  }}
                >
                  Link to purchase
                </Button>
              )}
            </article>
          ))}
        </div>
      )}
      {opened && <BillLightbox bill={opened} onClose={() => setOpened(null)} />}
      {linking && (
        <Modal
          isOpen
          title="Link bill to purchase"
          onClose={() => {
            if (!saving) setLinking(null);
          }}
          footer={
            <Button onClick={() => void link()} disabled={!choice} isLoading={saving}>
              Link bill
            </Button>
          }
        >
          <label htmlFor={purchasePickerId} className="block text-sm font-semibold">
            Purchase
          </label>
          <select
            id={purchasePickerId}
            value={choice}
            disabled={saving}
            onChange={(event) => setChoice(event.target.value)}
            className="mt-2 w-full rounded-lg border border-slate-300 p-2"
          >
            <option value="">Choose a purchase</option>
            {purchases
              .filter((purchase) => purchase.supplierReceivingId)
              .map((purchase) => (
                <option key={purchase.id} value={purchase.supplierReceivingId!}>
                  {purchase.receiptNumber || purchase.reference || purchase.transactionDate} ·{' '}
                  {purchase.description}
                </option>
              ))}
          </select>
          <p className="mt-2 text-xs text-slate-500">
            Purchases with a receiving document can be linked.
          </p>
          {error && (
            <p role="alert" className="mt-2 text-sm text-red-700">
              {error}
            </p>
          )}
          {purchasePages > 1 && (
            <div className="mt-3 flex items-center gap-2">
              <Button
                variant="secondary"
                disabled={saving || purchasePage <= 1}
                onClick={() => setPurchasePage((page) => page - 1)}
              >
                Previous
              </Button>
              <span>
                Page {purchasePage} of {purchasePages}
              </span>
              <Button
                variant="secondary"
                disabled={saving || purchasePage >= purchasePages}
                onClick={() => setPurchasePage((page) => page + 1)}
              >
                Next
              </Button>
            </div>
          )}
        </Modal>
      )}
    </section>
  );
}
