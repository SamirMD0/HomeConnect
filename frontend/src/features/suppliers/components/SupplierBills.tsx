import { useEffect, useId, useRef, useState } from 'react';
import { Badge, Button, Modal } from '../../../components/ui';
import { useAuth } from '../../../hooks/useAuth';
import { supplierBillsApi, type BillFilter, type SupplierBill } from '../api/supplier-bills.api';
import { supplierPurchasesApi } from '../api/supplier-purchases.api';
import { supplierTransactionsApi } from '../api/supplier-transactions.api';
import type { SupplierPurchase } from '../types/supplier-purchase.types';
import type { SupplierTransaction } from '../types/supplier.types';

const isLinked = (bill: SupplierBill) =>
  Boolean(bill.supplierReceivingId || bill.supplierTransactionId);
const pagesOf = (bill: SupplierBill) => (bill.pages?.length ? bill.pages : [bill]);
const DAY_MS = 24 * 60 * 60 * 1000;
/** Mirrors the server rule so the button only shows when the delete will work. */
function canDelete(bill: SupplierBill, user: { id: string; role: string } | null | undefined) {
  if (!user) return false;
  if (user.role === 'ADMIN' || user.role === 'MANAGER') return true;
  return (
    bill.capturedById === user.id &&
    !isLinked(bill) &&
    Date.now() - new Date(bill.capturedAt).getTime() < DAY_MS
  );
}

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
function BillLightbox({
  bill,
  onClose,
  onChanged,
}: {
  bill: SupplierBill;
  onClose: () => void;
  onChanged: () => void;
}) {
  const { user } = useAuth();
  const pages = pagesOf(bill);
  const [index, setIndex] = useState(0);
  const page = pages[Math.min(index, pages.length - 1)];
  const { url, error } = useBillImage(page);
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
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
  const run = async (action: () => Promise<unknown>) => {
    setBusy(true);
    setFailure(null);
    try {
      await action();
      onChanged();
      onClose();
    } catch (problem) {
      setFailure(problem instanceof Error ? problem.message : 'That did not work. Try again.');
    } finally {
      setBusy(false);
    }
  };
  const imageWidth = width * zoom;
  const imageHeight = imageWidth * aspect;
  const many = pages.length > 1;
  return (
    <Modal isOpen title="Supplier bill" size="xl" onClose={onClose}>
      <div className="flex flex-wrap items-center gap-2 pb-3">
        {many && (
          <>
            <Button
              variant="secondary"
              onClick={() => setIndex((value) => value - 1)}
              disabled={index === 0}
            >
              Previous page
            </Button>
            <span className="text-sm font-semibold" aria-live="polite">
              Page {index + 1} of {pages.length}
            </span>
            <Button
              variant="secondary"
              onClick={() => setIndex((value) => value + 1)}
              disabled={index >= pages.length - 1}
            >
              Next page
            </Button>
          </>
        )}
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
            download={`supplier-bill-${page.id}.${page.mime === 'image/png' ? 'png' : page.mime === 'image/jpeg' ? 'jpg' : page.mime.split('/')[1]}`}
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
      <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-3">
        <input
          ref={fileInput}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
          className="hidden"
          aria-label="New photo for this page"
          onChange={(event) => {
            const file = event.target.files?.[0];
            event.target.value = '';
            if (file) void run(() => supplierBillsApi.replace(page, file));
          }}
        />
        <Button variant="secondary" disabled={busy} onClick={() => fileInput.current?.click()}>
          Replace this page
        </Button>
        {isLinked(bill) && (
          <Button variant="secondary" disabled={busy} onClick={() => void run(() => supplierBillsApi.unlinkAll(bill))}>
            Unlink bill
          </Button>
        )}
        {canDelete(bill, user) &&
          (confirmDelete ? (
            <>
              <span className="text-sm font-semibold text-red-700">Delete for good?</span>
              {many && (
                <Button
                  variant="secondary"
                  disabled={busy}
                  onClick={() => void run(() => supplierBillsApi.remove(page, false))}
                >
                  This page only
                </Button>
              )}
              <Button
                variant="danger"
                disabled={busy}
                onClick={() => void run(() => supplierBillsApi.remove(page, true))}
              >
                {many ? 'Whole bill' : 'Delete bill'}
              </Button>
              <Button variant="ghost" disabled={busy} onClick={() => setConfirmDelete(false)}>
                Keep it
              </Button>
            </>
          ) : (
            <Button variant="ghost" disabled={busy} onClick={() => setConfirmDelete(true)}>
              Delete…
            </Button>
          ))}
      </div>
      {failure && (
        <p role="alert" className="mt-2 text-sm text-red-700">
          {failure}
        </p>
      )}
    </Modal>
  );
}

type LinkOption = { value: string; label: string };
/** Purchases with stock link through their receiving; everything else through the entry. */
function purchaseOption(purchase: SupplierPurchase): LinkOption {
  const name = `${purchase.receiptNumber || purchase.reference || purchase.transactionDate} · ${purchase.description}`;
  return purchase.supplierReceivingId
    ? { value: `r:${purchase.supplierReceivingId}`, label: `Purchase · ${name}` }
    : { value: `t:${purchase.id}`, label: `Purchase · ${name}` };
}
function paymentOption(payment: SupplierTransaction): LinkOption {
  return {
    value: `t:${payment.id}`,
    label: `Payment · ${payment.transactionDate.slice(0, 10)} · ${payment.amount} · ${payment.description}`,
  };
}

export function SupplierBills({
  supplierId,
  receivingId,
  transactionId,
}: {
  supplierId?: string;
  receivingId?: string;
  /** Bills attached to one ledger entry (a payment, or a purchase). */
  transactionId?: string;
}) {
  const purchasePickerId = useId();
  const attached = Boolean(receivingId || transactionId);
  const [filter, setFilter] = useState<BillFilter>('false');
  const [bills, setBills] = useState<SupplierBill[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [revision, setRevision] = useState(0);
  const [opened, setOpened] = useState<SupplierBill | null>(null);
  const [linking, setLinking] = useState<SupplierBill | null>(null);
  const [options, setOptions] = useState<LinkOption[]>([]);
  const [purchasePage, setPurchasePage] = useState(1);
  const [purchasePages, setPurchasePages] = useState(1);
  const [choice, setChoice] = useState('');
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    const load = transactionId
      ? supplierBillsApi.forTransaction(transactionId)
      : receivingId
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
  }, [supplierId, receivingId, transactionId, filter, revision]);
  useEffect(() => {
    if (!linking) return;
    let active = true;
    setSaving(true);
    void Promise.all([
      supplierPurchasesApi.list(linking.supplierId, purchasePage, 50),
      // Payments are fewer; the first 50 recent ones cover the usual case.
      purchasePage === 1
        ? supplierTransactionsApi
            .list(linking.supplierId, false, 1, 50)
            .then((result) => result.items.filter((item) => item.type === 'SUPPLIER_PAYMENT'))
            .catch(() => [] as SupplierTransaction[])
        : Promise.resolve([] as SupplierTransaction[]),
    ])
      .then(([purchases, payments]) => {
        if (!active) return;
        setOptions([
          ...purchases.items.filter((item) => item.status !== 'REMOVED').map(purchaseOption),
          ...payments.map(paymentOption),
        ]);
        setPurchasePages(purchases.pagination.totalPages);
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
      const [kind, id] = [choice.slice(0, 1), choice.slice(2)];
      if (kind === 'r') await supplierBillsApi.link(linking, id);
      else await supplierBillsApi.linkEntry(linking, id);
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
      aria-label={attached ? 'Attached bills' : 'Bills'}
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 font-bold">
          {attached ? 'Attached bills' : 'Bills'} <Badge>{bills.length}</Badge>
        </h2>
        <div className="flex flex-wrap items-center gap-3">
          {!attached && (
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
            attached
              ? 'flex gap-3 overflow-x-auto pb-2'
              : 'grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4'
          }
        >
          {bills.map((bill) => {
            const pageCount = pagesOf(bill).length;
            return (
              <article
                key={bill.id}
                className={`space-y-2 rounded-lg border border-slate-200 p-3 ${attached ? 'w-48 shrink-0' : ''}`}
              >
                <BillThumbnail bill={bill} onOpen={() => setOpened(bill)} />
                <p className="text-xs text-slate-500">
                  {new Date(bill.capturedAt).toLocaleString('en-GB')}
                </p>
                <div className="flex flex-wrap gap-1">
                  <Badge tone={isLinked(bill) ? 'success' : 'neutral'}>
                    {isLinked(bill) ? 'Linked' : 'Unlinked'}
                  </Badge>
                  {pageCount > 1 && <Badge>{pageCount} pages</Badge>}
                </div>
                {bill.note && (
                  <p className="line-clamp-3 whitespace-pre-wrap text-sm">{bill.note}</p>
                )}
                {!isLinked(bill) && (
                  <Button
                    variant="secondary"
                    onClick={() => {
                      setChoice('');
                      setOptions([]);
                      setPurchasePage(1);
                      setLinking(bill);
                    }}
                  >
                    Link to purchase or payment
                  </Button>
                )}
              </article>
            );
          })}
        </div>
      )}
      {opened && (
        <BillLightbox
          bill={opened}
          onClose={() => setOpened(null)}
          onChanged={() => setRevision((value) => value + 1)}
        />
      )}
      {linking && (
        <Modal
          isOpen
          title="Link bill"
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
            Purchase or payment
          </label>
          <select
            id={purchasePickerId}
            value={choice}
            disabled={saving}
            onChange={(event) => setChoice(event.target.value)}
            className="mt-2 w-full rounded-lg border border-slate-300 p-2"
          >
            <option value="">Choose one</option>
            {options.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
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
