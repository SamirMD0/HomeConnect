import React, { FormEvent, useState } from 'react';
import axios from 'axios';
import toast from 'react-hot-toast';
import { ArrowLeft, ArchiveX, Edit3, History, RotateCcw, Tag } from 'lucide-react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Modal } from '../../components/ui/Modal';
import {
  formatBusinessDate,
  formatMoney,
} from '../../features/customer-financial/utils/financial-format';
import { ServiceJobAuditList } from '../../features/service/components/ServiceJobAuditList';
import { ServiceJobStatusChip } from '../../features/service/components/ServiceJobStatusChip';
import {
  useCancelServiceJob,
  useChangeServiceStatus,
  useReopenServiceJob,
  useServiceJob,
  useUpdateServiceJob,
} from '../../features/service/hooks/useServiceJobs';
import { FINAL_SERVICE_STATUSES } from '../../features/service/utils/service-status';
import {
  ServiceJob,
  ServiceJobStatus,
  UpdateServiceJobInput,
  resolveProductDisplay,
} from '../../features/service/types/service.types';
import {
  REQUEST_TYPE_LABELS,
  ROUTING_LABELS,
  STATUS_LABELS,
  WARRANTY_LABELS,
} from '../../features/service/utils/service-labels';
import { useAuth } from '../../hooks/useAuth';
import { businessLabels } from '../../shared/labels/business-labels';

const activeStatuses = Object.keys(STATUS_LABELS).filter(
  (status) => !FINAL_SERVICE_STATUSES.includes(status as ServiceJobStatus)
) as ServiceJobStatus[];

export const ServiceJobDetailsPage: React.FC = () => {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const jobQuery = useServiceJob(id);
  const [dialog, setDialog] = useState<'edit' | 'status' | 'cancel' | 'reopen' | null>(null);
  if (jobQuery.isLoading)
    return <div className="p-12 text-center text-slate-500">Loading service job...</div>;
  if (!jobQuery.data)
    return (
      <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-4 text-red-700">
        Service job could not be loaded.
      </div>
    );
  const job = jobQuery.data;
  const product = resolveProductDisplay(job);
  const isAdmin = user?.role === 'ADMIN';
  const isFinal = FINAL_SERVICE_STATUSES.includes(job.status);
  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <button
            onClick={() => navigate('/service')}
            className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"
            aria-label="Back to service jobs"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <div>
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="text-2xl font-bold text-slate-900">{job.jobNumber}</h1>
              <ServiceJobStatusChip status={job.status} />
            </div>
            <p className="mt-1 user-text text-slate-500" dir="auto">
              {product.name}
              {product.model ? ` · ${product.model}` : ''}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {job.productId && (
            <Link
              to={`/products/${job.productId}/label`}
              className="inline-flex items-center gap-2 rounded-lg border border-slate-300 px-3 py-2 font-medium"
            >
              <Tag className="h-4 w-4" /> {businessLabels.product.printLabel}
            </Link>
          )}
          <button
            onClick={() => setDialog('edit')}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-300 px-3 py-2 font-medium"
          >
            <Edit3 className="h-4 w-4" /> {businessLabels.common.edit}
          </button>
          {!isFinal && (
            <button
              onClick={() => setDialog('status')}
              className="rounded-lg bg-emerald-600 px-3 py-2 font-semibold text-white"
            >
              Change Status / تغيير الحالة
            </button>
          )}
          {isAdmin && !isFinal && (
            <button
              onClick={() => setDialog('cancel')}
              className="inline-flex items-center gap-2 rounded-lg border border-red-200 px-3 py-2 font-medium text-red-700"
            >
              <ArchiveX className="h-4 w-4" /> {businessLabels.common.cancel}
            </button>
          )}
          {isAdmin && isFinal && (
            <button
              onClick={() => setDialog('reopen')}
              className="inline-flex items-center gap-2 rounded-lg border border-amber-300 px-3 py-2 font-medium text-amber-800"
            >
              <RotateCcw className="h-4 w-4" /> Reopen / إعادة فتح
            </button>
          )}
        </div>
      </div>
      <div className="grid gap-6 lg:grid-cols-3">
        <section className="space-y-5 lg:col-span-2">
          <DetailSection title="Customer">
            <Link
              to={`/customers/${job.customer.id}`}
              className="user-text font-semibold text-emerald-700"
              dir="auto"
            >
              {job.customer.name}
            </Link>
            <p className="text-sm text-slate-500">{job.customer.phone}</p>
          </DetailSection>
          <DetailSection title="Service details">
            <DetailGrid
              values={[
                ['Request', REQUEST_TYPE_LABELS[job.requestType]],
                [
                  'Product',
                  job.productId ? (
                    <Link
                      to={`/products?focus=${job.productId}`}
                      className="font-semibold text-emerald-700 hover:underline"
                    >
                      {product.name}
                    </Link>
                  ) : (
                    product.name
                  ),
                ],
                ['Model', product.model ?? '—'],
                ['Brand', product.brand ?? '—'],
                ['Issue', job.issueDescription],
                ['Requested part', job.requestedPartName ?? '—'],
              ]}
            />
          </DetailSection>
          <DetailSection title="Routing & warranty">
            <DetailGrid
              values={[
                [
                  'Routing',
                  job.routingDecision ? ROUTING_LABELS[job.routingDecision] : 'Not decided',
                ],
                ['Company', job.companyName ?? '—'],
                ['Warranty', WARRANTY_LABELS[job.warrantyStatus]],
                ['Provider', job.warrantyProvider ?? '—'],
                [
                  'Warranty expiry',
                  job.warrantyExpiresAt ? formatBusinessDate(job.warrantyExpiresAt) : '—',
                ],
              ]}
            />
          </DetailSection>
          <DetailSection title="Notes">
            <p className="user-text-pre text-sm text-slate-700" dir="auto">
              {job.notes || 'No notes.'}
            </p>
          </DetailSection>
        </section>
        <aside className="space-y-6">
          <DetailSection title="Timeline">
            <DetailGrid
              values={[
                ['Created', formatBusinessDate(job.serviceCreatedDate)],
                ['Home visit', dateLabel(job.homeVisitScheduledDate)],
                ['Sent to company', dateLabel(job.sentToCompanyDate)],
                ['Received back', dateLabel(job.receivedFromCompanyDate)],
                ['Returned', dateLabel(job.returnedToCustomerDate)],
              ]}
            />
          </DetailSection>
          <DetailSection title="Price">
            <DetailGrid
              values={[
                ['Estimated', job.estimatedPrice ? formatMoney(job.estimatedPrice) : '—'],
                ['Final', job.finalPrice ? formatMoney(job.finalPrice) : '—'],
              ]}
            />
          </DetailSection>
        </aside>
      </div>
      {isAdmin && (
        <DetailSection title="Audit history" icon={<History className="h-5 w-5" />}>
          <ServiceJobAuditList serviceJobId={job.id} />
        </DetailSection>
      )}
      <EditDialog
        job={job}
        isAdmin={isAdmin}
        open={dialog === 'edit'}
        onClose={() => setDialog(null)}
      />
      <StatusDialog
        job={job}
        isAdmin={isAdmin}
        open={dialog === 'status'}
        onClose={() => setDialog(null)}
      />
      <TerminalDialog
        job={job}
        mode="cancel"
        open={dialog === 'cancel'}
        onClose={() => setDialog(null)}
      />
      <TerminalDialog
        job={job}
        mode="reopen"
        open={dialog === 'reopen'}
        onClose={() => setDialog(null)}
      />
    </div>
  );
};

const DetailSection: React.FC<{
  title: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
}> = ({ title, icon, children }) => (
  <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
    <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold text-slate-800">
      {icon}
      {title}
    </h2>
    {children}
  </section>
);
const DetailGrid: React.FC<{ values: [string, React.ReactNode][] }> = ({ values }) => (
  <dl className="grid gap-4 sm:grid-cols-2">
    {values.map(([label, value]) => (
      <div key={label}>
        <dt className="text-xs font-medium uppercase text-slate-500">{label}</dt>
        <dd className="user-text mt-1 text-sm text-slate-800" dir="auto">
          {value}
        </dd>
      </div>
    ))}
  </dl>
);
const dateLabel = (value: string | null) => (value ? formatBusinessDate(value) : '—');

const EditDialog: React.FC<{
  job: ServiceJob;
  isAdmin: boolean;
  open: boolean;
  onClose: () => void;
}> = ({ job, isAdmin, open, onClose }) => {
  const mutation = useUpdateServiceJob(job.id);
  const [error, setError] = useState('');
  const [form, setForm] = useState({
    issueDescription: job.issueDescription,
    requestedPartName: job.requestedPartName ?? '',
    notes: job.notes ?? '',
    estimatedPrice: job.estimatedPrice ?? '',
    finalPrice: job.finalPrice ?? '',
    routingDecision: job.routingDecision ?? '',
    companyName: job.companyName ?? '',
    warrantyStatus: job.warrantyStatus,
    sentToCompanyDate: job.sentToCompanyDate ?? '',
    receivedFromCompanyDate: job.receivedFromCompanyDate ?? '',
    returnedToCustomerDate: job.returnedToCustomerDate ?? '',
    reason: '',
    accountPassword: '',
  });
  const set = (key: keyof typeof form, value: string) => setForm({ ...form, [key]: value });
  const submit = (event: FormEvent) => {
    event.preventDefault();
    setError('');
    const input: UpdateServiceJobInput = isAdmin
      ? {
          issueDescription: form.issueDescription,
          requestedPartName: form.requestedPartName || null,
          notes: form.notes || null,
          estimatedPrice: form.estimatedPrice || null,
          finalPrice: form.finalPrice || null,
          routingDecision: (form.routingDecision ||
            null) as UpdateServiceJobInput['routingDecision'],
          companyName: form.companyName || null,
          warrantyStatus: form.warrantyStatus,
          sentToCompanyDate: form.sentToCompanyDate || null,
          receivedFromCompanyDate: form.receivedFromCompanyDate || null,
          returnedToCustomerDate: form.returnedToCustomerDate || null,
          reason: form.reason,
          accountPassword: form.accountPassword,
        }
      : { requestedPartName: form.requestedPartName || null, notes: form.notes || null };
    mutation.mutate(input, {
      onSuccess: () => {
        toast.success('Service job updated');
        onClose();
      },
      onError: (reason) => setError(apiError(reason)),
    });
  };
  return (
    <Modal
      isOpen={open}
      onClose={onClose}
      title={businessLabels.service.editJob}
      maxWidth="max-w-2xl"
    >
      <form onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
        {error && (
          <p role="alert" className="sm:col-span-2 rounded bg-red-50 p-3 text-sm text-red-700">
            {error}
          </p>
        )}
        <Field
          label="Issue / العطل"
          value={form.issueDescription}
          onChange={(v) => set('issueDescription', v)}
          textarea
          disabled={!isAdmin}
        />
        <Field
          label={businessLabels.service.requestedPart}
          value={form.requestedPartName}
          onChange={(v) => set('requestedPartName', v)}
        />
        <Field
          label={businessLabels.common.notes}
          value={form.notes}
          onChange={(v) => set('notes', v)}
          textarea
        />
        {isAdmin && (
          <>
            <Field
              label="Estimated Price / السعر التقديري"
              value={form.estimatedPrice}
              onChange={(v) => set('estimatedPrice', v)}
            />
            <Field
              label="Final Price / السعر النهائي"
              value={form.finalPrice}
              onChange={(v) => set('finalPrice', v)}
            />
            <label className="text-sm font-medium">
              {businessLabels.service.routing}
              <select
                value={form.routingDecision}
                onChange={(e) => set('routingDecision', e.target.value)}
                className="mt-1 w-full rounded-lg border px-3 py-2"
              >
                <option value="">Not Decided / لم يحدد</option>
                {Object.entries(ROUTING_LABELS).map(([v, l]) => (
                  <option key={v} value={v}>
                    {l}
                  </option>
                ))}
              </select>
            </label>
            <Field
              label={businessLabels.service.company}
              value={form.companyName}
              onChange={(v) => set('companyName', v)}
            />
            <label className="text-sm font-medium">
              {businessLabels.service.warranty}
              <select
                value={form.warrantyStatus}
                onChange={(e) => set('warrantyStatus', e.target.value)}
                className="mt-1 w-full rounded-lg border px-3 py-2"
              >
                {Object.entries(WARRANTY_LABELS).map(([v, l]) => (
                  <option key={v} value={v}>
                    {l}
                  </option>
                ))}
              </select>
            </label>
            <Field
              label="Sent to Company / أرسل إلى الشركة"
              type="date"
              value={form.sentToCompanyDate}
              onChange={(v) => set('sentToCompanyDate', v)}
            />
            <Field
              label="Received from Company / استلم من الشركة"
              type="date"
              value={form.receivedFromCompanyDate}
              onChange={(v) => set('receivedFromCompanyDate', v)}
            />
            <Field
              label="Returned to Customer / سلّم إلى الزبون"
              type="date"
              value={form.returnedToCustomerDate}
              onChange={(v) => set('returnedToCustomerDate', v)}
            />
            <Field
              label="Reason * / السبب *"
              value={form.reason}
              onChange={(v) => set('reason', v)}
              textarea
            />
            <Field
              label="Account Password * / كلمة مرور الحساب *"
              type="password"
              value={form.accountPassword}
              onChange={(v) => set('accountPassword', v)}
            />
          </>
        )}
        <div className="sm:col-span-2 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded-lg border px-4 py-2">
            {businessLabels.common.cancel}
          </button>
          <button
            disabled={mutation.isPending}
            className="rounded-lg bg-emerald-600 px-4 py-2 font-semibold text-white"
          >
            {businessLabels.common.saveChanges}
          </button>
        </div>
      </form>
    </Modal>
  );
};

const StatusDialog: React.FC<{
  job: ServiceJob;
  isAdmin: boolean;
  open: boolean;
  onClose: () => void;
}> = ({ job, isAdmin, open, onClose }) => {
  const mutation = useChangeServiceStatus(job.id);
  const [status, setStatus] = useState<ServiceJobStatus>('INSPECTION_PENDING');
  const [reason, setReason] = useState('');
  const [password, setPassword] = useState('');
  const [date, setDate] = useState('');
  const [error, setError] = useState('');
  const dateField =
    status === 'SENT_TO_COMPANY'
      ? 'sentToCompanyDate'
      : status === 'DELIVERED_TO_CUSTOMER' || status === 'PRODUCT_EXCHANGE'
        ? 'returnedToCustomerDate'
        : job.status === 'SENT_TO_COMPANY' &&
            (status === 'READY_FOR_PICKUP' || status === 'IN_WORKSHOP_REPAIR')
          ? 'receivedFromCompanyDate'
          : null;
  const submit = (e: FormEvent) => {
    e.preventDefault();
    const body: {
      status: ServiceJobStatus;
      reason?: string;
      accountPassword?: string;
      sentToCompanyDate?: string;
      receivedFromCompanyDate?: string;
      returnedToCustomerDate?: string;
    } = { status, ...(isAdmin ? { reason, accountPassword: password } : {}) };
    if (dateField && date) body[dateField] = date;
    mutation.mutate(body, {
      onSuccess: () => {
        toast.success('Status updated');
        onClose();
      },
      onError: (r) => setError(apiError(r)),
    });
  };
  return (
    <Modal isOpen={open} onClose={onClose} title="Change service status">
      <form onSubmit={submit} className="space-y-4">
        {error && <p className="rounded bg-red-50 p-3 text-sm text-red-700">{error}</p>}
        <label className="block text-sm font-medium">
          New status
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value as ServiceJobStatus)}
            className="mt-1 w-full rounded-lg border px-3 py-2"
          >
            {(isAdmin
              ? Object.keys(STATUS_LABELS).filter((v) => v !== 'CANCELLED')
              : activeStatuses
            ).map((value) => (
              <option key={value} value={value}>
                {STATUS_LABELS[value as ServiceJobStatus]}
              </option>
            ))}
          </select>
        </label>
        {dateField && (
          <Field label={`${dateField} *`} type="date" value={date} onChange={setDate} />
        )}{' '}
        {isAdmin && (
          <>
            <Field label="Reason" value={reason} onChange={setReason} textarea />
            <Field
              label="Account password"
              type="password"
              value={password}
              onChange={setPassword}
            />
          </>
        )}
        <button className="w-full rounded-lg bg-emerald-600 px-4 py-2 font-semibold text-white">
          Update status
        </button>
      </form>
    </Modal>
  );
};

const TerminalDialog: React.FC<{
  job: ServiceJob;
  mode: 'cancel' | 'reopen';
  open: boolean;
  onClose: () => void;
}> = ({ job, mode, open, onClose }) => {
  const cancel = useCancelServiceJob(job.id);
  const reopen = useReopenServiceJob(job.id);
  const [reason, setReason] = useState('');
  const [password, setPassword] = useState('');
  const [status, setStatus] = useState<ServiceJobStatus>('RECEIVED');
  const [error, setError] = useState('');
  const submit = (e: FormEvent) => {
    e.preventDefault();
    const options = {
      onSuccess: () => {
        toast.success(mode === 'cancel' ? 'Service job cancelled' : 'Service job reopened');
        onClose();
      },
      onError: (r: unknown) => setError(apiError(r)),
    };
    if (mode === 'cancel') cancel.mutate({ reason, accountPassword: password }, options);
    else reopen.mutate({ status, reason, accountPassword: password }, options);
  };
  return (
    <Modal
      isOpen={open}
      onClose={onClose}
      title={mode === 'cancel' ? 'Cancel service job' : 'Reopen service job'}
    >
      <form onSubmit={submit} className="space-y-4">
        {error && <p className="rounded bg-red-50 p-3 text-sm text-red-700">{error}</p>}
        {mode === 'reopen' && (
          <label className="block text-sm font-medium">
            Reopen as
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value as ServiceJobStatus)}
              className="mt-1 w-full rounded-lg border px-3 py-2"
            >
              {activeStatuses.map((value) => (
                <option key={value} value={value}>
                  {STATUS_LABELS[value]}
                </option>
              ))}
            </select>
          </label>
        )}
        <Field label="Reason *" value={reason} onChange={setReason} textarea />
        <Field label="Account password *" type="password" value={password} onChange={setPassword} />
        <button
          className={`w-full rounded-lg px-4 py-2 font-semibold text-white ${mode === 'cancel' ? 'bg-red-600' : 'bg-amber-600'}`}
        >
          {mode === 'cancel' ? 'Cancel service job' : 'Reopen service job'}
        </button>
      </form>
    </Modal>
  );
};

const Field: React.FC<{
  label: string;
  value: string;
  onChange: (v: string) => void;
  textarea?: boolean;
  type?: string;
  disabled?: boolean;
}> = ({ label, value, onChange, textarea = false, type = 'text', disabled = false }) => (
  <label className="block text-sm font-medium text-slate-700">
    {label}
    {textarea ? (
      <textarea
        dir="auto"
        disabled={disabled}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="user-text-input mt-1 min-h-20 w-full rounded-lg border border-slate-300 px-3 py-2 disabled:bg-slate-100"
      />
    ) : (
      <input
        dir={type === 'text' ? 'auto' : undefined}
        disabled={disabled}
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="user-text-input mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 disabled:bg-slate-100"
      />
    )}
  </label>
);
function apiError(error: unknown) {
  return axios.isAxiosError(error)
    ? (error.response?.data?.error?.message ?? 'Request failed')
    : 'Request failed';
}
