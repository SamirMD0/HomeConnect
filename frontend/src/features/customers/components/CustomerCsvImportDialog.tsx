import { isBranchDependentQuery } from '../../branches/scope/branch-scope-store';
import { useContext, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Modal } from '../../../components/ui/Modal';
import { Button } from '../../../components/ui/Button';
import { BranchScopeContext } from '../../branches/scope/BranchScopeProvider';
import { useCreateGuard, useRecordBranch } from '../../branches/scope/branch-ui';
import {
  customerImportsApi,
  importFields,
  type ImportMapping,
  type CustomerImportDecision,
  type CustomerImportPreview,
  type CustomerImportResult,
} from '../api/customer-import.api';

export const customerImportSteps = [
  'Destination / الفرع',
  'Upload / رفع الملف',
  'Map columns / ربط الأعمدة',
  'Preview / معاينة',
  'Resolve / حل التعارضات',
  'Confirm / تأكيد',
  'Result / النتيجة',
] as const;
const labels = {
  name: 'Name / الاسم',
  phone: 'Phone / الهاتف',
  address: 'Address / العنوان',
  notes: 'Notes / ملاحظات',
  creditLimit: 'Credit limit USD / سقف الدين',
  openingBalance: 'Opening balance / رصيد افتتاحي',
  currency: 'Currency / العملة',
  dueDate: 'Due date / تاريخ الاستحقاق',
  isActive: 'Active / نشط',
};
const control = 'rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm';
interface WizardProps {
  step: number;
  branchId: string;
  branchName: string;
  branches: Array<{ id: string; name: string }>;
  preview: CustomerImportPreview | null;
  mapping: ImportMapping;
  result: CustomerImportResult | null;
  password: string;
  busy: boolean;
  error: string;
  hasFile: boolean;
  onBranch: (id: string) => void;
  onFile: (file: File | null) => void;
  onMapping: (mapping: ImportMapping) => void;
  onDecision: (decision: CustomerImportDecision) => void;
  onPassword: (password: string) => void;
  onNext: () => void;
  onBack: () => void;
  onRefresh: () => void;
}
export function importNeedsResolution(preview: CustomerImportPreview): boolean {
  const keys = new Set<string>();
  return preview.rows.some((row) => {
    const d = row.decision;
    if (d.action === 'SKIP') return false;
    const key = row.phoneKey;
    if (keys.has(key)) return true;
    keys.add(key);
    return (
      row.status === 'INVALID' ||
      (d.action === 'CREATE' && row.matches.length > 0) ||
      (d.action === 'UPDATE' &&
        (row.matches.length !== 1 ||
          d.targetCustomerId !== row.matches[0].id ||
          (row.matches[0].hasImportedOpeningDebt &&
            Number(row.openingBalance) > 0 &&
            !d.skipOpeningBalance)))
    );
  });
}
export function CustomerImportSummary({ result }: { result: CustomerImportResult }) {
  return (
    <dl className="grid grid-cols-2 gap-3 rounded-lg bg-slate-50 p-4 text-sm">
      {[
        ['Created / جديد', result.created],
        ['Updated / محدّث', result.updated],
        ['Skipped / مستبعد', result.skipped],
        ['Opening debts / ديون افتتاحية', result.openingDebts],
        ['Opening debts total USD / مجموع الديون بالدولار', '$' + result.openingDebtTotalUsd],
      ].map(([label, value]) => (
        <div key={label}>
          <dt>{label}</dt>
          <dd className="font-semibold">{value}</dd>
        </div>
      ))}
    </dl>
  );
}
export function CustomerImportWizard(props: WizardProps) {
  const { step, preview } = props;
  const needsPassword = step === 5 && Boolean(preview?.planned.openingDebts);
  const unresolved = preview ? importNeedsResolution(preview) : false;
  const disabled =
    props.busy ||
    (step === 0 && !props.branchId) ||
    (step === 1 && !props.hasFile) ||
    (step === 2 && (props.mapping.name == null || props.mapping.phone == null)) ||
    (step === 4 && unresolved) ||
    (needsPassword && !props.password);
  return (
    <div className="space-y-4">
      <p className="rounded-lg border border-brand-200 bg-brand-50 p-3 font-semibold" role="status">
        Importing into: / الاستيراد إلى:{' '}
        <span dir="auto">{props.branchName || 'Select a branch / اختر الفرع'}</span>
      </p>
      <ol className="flex flex-wrap gap-2 text-xs" aria-label="Import steps / خطوات الاستيراد">
        {customerImportSteps.map((label, index) => (
          <li
            key={label}
            aria-current={index === step ? 'step' : undefined}
            className={index === step ? 'font-bold text-brand-700' : 'text-slate-500'}
          >
            {index + 1}. {label}
          </li>
        ))}
      </ol>
      <h3 className="font-semibold">{customerImportSteps[step]}</h3>
      {props.error && (
        <div role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">
          {props.error}
          <button
            type="button"
            className="ml-3 underline"
            onClick={props.onRefresh}
            disabled={props.busy || !preview}
          >
            Refresh preview / تحديث المعاينة
          </button>
        </div>
      )}
      {step === 0 && (
        <label className="block text-sm">
          Destination branch / الفرع المستهدف
          <select
            aria-label="Destination branch / الفرع المستهدف"
            className={control + ' mt-2 block w-full'}
            value={props.branchId}
            onChange={(event) => props.onBranch(event.target.value)}
          >
            <option value="">Select a branch / اختر الفرع</option>
            {props.branches.map((branch) => (
              <option key={branch.id} value={branch.id} dir="auto">
                {branch.name}
              </option>
            ))}
          </select>
        </label>
      )}
      {step === 1 && (
        <label className="block text-sm">
          CSV file (750 KB, 2,000 rows) / ملف CSV
          <input
            aria-label="CSV file / ملف CSV"
            className="mt-2 block"
            type="file"
            accept=".csv,text/csv"
            onChange={(event) => props.onFile(event.target.files?.[0] ?? null)}
          />
        </label>
      )}
      {step === 2 && (
        <div className="grid gap-3 sm:grid-cols-2">
          {importFields.map((field) => (
            <label key={field} className="text-sm">
              {labels[field]}
              {['name', 'phone'].includes(field) && ' *'}
              <select
                className={control + ' block w-full'}
                value={props.mapping[field] ?? ''}
                onChange={(event) =>
                  props.onMapping({
                    ...props.mapping,
                    [field]: event.target.value === '' ? null : Number(event.target.value),
                  })
                }
              >
                <option value="">Ignore / تجاهل</option>
                {preview?.headers.map((header, index) => (
                  <option key={index} value={index} dir="auto">
                    {header}
                  </option>
                ))}
              </select>
            </label>
          ))}
        </div>
      )}
      {(step === 3 || step === 4) && preview && (
        <>
          {preview.previousCommittedImport && (
            <p role="alert" className="rounded-lg bg-amber-50 p-3 text-sm">
              This file was already imported into this branch. Matching rows default to SKIP. / تم
              استيراد هذا الملف إلى هذا الفرع سابقاً.
            </p>
          )}
          <p className="text-sm">
            Ready / جاهز: {preview.summary.ready} · Conflicts / تعارض: {preview.summary.conflicts} ·
            Invalid / غير صالح: {preview.summary.invalid}
          </p>
          <div className="max-h-[45vh] overflow-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr>
                  <th>Row / السطر</th>
                  <th>Customer / الزبون</th>
                  <th>Status / الحالة</th>
                  <th>Issues / ملاحظات</th>
                  {step === 4 && <th>Decision / القرار</th>}
                </tr>
              </thead>
              <tbody>
                {preview.rows.map((row) => (
                  <tr key={row.rowNumber} className="border-b border-slate-200 align-top">
                    <td className="p-2">{row.rowNumber}</td>
                    <td className="p-2">
                      <span dir="auto">{row.name}</span>
                      <br />
                      <span dir="auto">{row.phone}</span>
                      <br />
                      {row.openingBalance} {row.currency}
                    </td>
                    <td className="p-2">{row.status}</td>
                    <td className="p-2">
                      {[...row.issues, ...row.conflicts.map((conflict) => conflict.message)].map(
                        (issue, i) => (
                          <p key={i} dir="auto">
                            {issue}
                          </p>
                        )
                      )}
                    </td>
                    {step === 4 && (
                      <td className="space-y-2 p-2">
                        <select
                          aria-label={'Action for row ' + row.rowNumber}
                          className={control}
                          value={row.decision.action}
                          onChange={(event) => {
                            const action = event.target.value as CustomerImportDecision['action'];
                            props.onDecision({
                              rowNumber: row.rowNumber,
                              action,
                              ...(action === 'UPDATE'
                                ? {
                                    targetCustomerId: row.matches[0]?.id,
                                    updateFields: (
                                      ['name', 'address', 'notes', 'creditLimit'] as const
                                    ).filter(
                                      (field) =>
                                        preview.columnMapping[field] != null &&
                                        row[field] !== undefined
                                    ),
                                  }
                                : {}),
                            });
                          }}
                        >
                          <option value="SKIP">SKIP / استبعاد</option>
                          {row.status !== 'INVALID' && !row.matches.length && (
                            <option value="CREATE">CREATE / إنشاء</option>
                          )}
                          {row.status !== 'INVALID' && row.matches.length === 1 && (
                            <option value="UPDATE">UPDATE / تحديث</option>
                          )}
                        </select>
                        {row.decision.action === 'UPDATE' &&
                          (['name', 'address', 'notes', 'creditLimit'] as const)
                            .filter(
                              (field) =>
                                preview.columnMapping[field] != null && row[field] !== undefined
                            )
                            .map((field) => (
                              <label key={field} className="block whitespace-nowrap">
                                <input
                                  type="checkbox"
                                  checked={row.decision.updateFields?.includes(field) ?? false}
                                  onChange={(event) =>
                                    props.onDecision({
                                      ...row.decision,
                                      updateFields: event.target.checked
                                        ? [...(row.decision.updateFields ?? []), field]
                                        : row.decision.updateFields?.filter(
                                            (value) => value !== field
                                          ),
                                    })
                                  }
                                />{' '}
                                {labels[field]}
                              </label>
                            ))}
                        {row.decision.action !== 'SKIP' && Number(row.openingBalance) > 0 && (
                          <label className="block">
                            <input
                              type="checkbox"
                              checked={row.decision.skipOpeningBalance ?? false}
                              onChange={(event) =>
                                props.onDecision({
                                  ...row.decision,
                                  skipOpeningBalance: event.target.checked,
                                })
                              }
                            />{' '}
                            Skip opening amount / تجاهل الرصيد الافتتاحي
                          </label>
                        )}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {step === 4 && unresolved && (
            <p role="alert" className="text-sm text-amber-700">
              Skip invalid rows, choose one row per phone, and skip amounts already imported. / يرجى
              حل التعارضات قبل المتابعة.
            </p>
          )}
        </>
      )}
      {step === 5 && preview && (
        <>
          <CustomerImportSummary result={preview.planned} />
          <p className="text-xs text-slate-500">
            LBP amounts use the current exchange rate at commit. / تُحوّل الليرة بسعر الصرف عند
            التأكيد.
          </p>
          {needsPassword && (
            <label className="block text-sm">
              Account password / كلمة مرور الحساب
              <input
                aria-label="Account password / كلمة مرور الحساب"
                className={control + ' mt-2 block w-full'}
                type="password"
                autoComplete="current-password"
                value={props.password}
                onChange={(event) => props.onPassword(event.target.value)}
              />
            </label>
          )}
        </>
      )}
      {step === 6 && props.result && (
        <>
          <CustomerImportSummary result={props.result} />
          <a
            className="inline-block text-sm font-medium text-brand-700 underline"
            download="customer-import-skipped.csv"
            href={
              'data:text/csv;charset=utf-8,' +
              encodeURIComponent('\uFEFF' + (props.result.reportCsv ?? ''))
            }
          >
            Download skipped and invalid rows / تنزيل الصفوف المستبعدة وغير الصالحة
          </a>
        </>
      )}
      {step < 6 && (
        <div className="flex justify-end gap-2">
          {(step === 1 || step > 2) && (
            <Button variant="secondary" onClick={props.onBack} disabled={props.busy}>
              Back / رجوع
            </Button>
          )}
          <Button onClick={props.onNext} disabled={disabled} isLoading={props.busy}>
            {step === 5 ? 'Commit import / تأكيد الاستيراد' : 'Continue / متابعة'}
          </Button>
        </div>
      )}
    </div>
  );
}
function CustomerImportSession({ onClose }: { onClose: () => void }) {
  const scope = useContext(BranchScopeContext);
  const guard = useCreateGuard();
  const queryClient = useQueryClient();
  const [branchId, setBranchId] = useState(guard.blocked ? '' : (scope?.selectedBranch?.id ?? ''));
  const [step, setStep] = useState(0);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<CustomerImportPreview | null>(null);
  const [mapping, setMapping] = useState<ImportMapping>({});
  const [result, setResult] = useState<CustomerImportResult | null>(null);
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useRecordBranch(preview?.branchId);
  const perform = async (operation: () => Promise<void>) => {
    setBusy(true);
    setError('');
    try {
      await operation();
    } catch (caught) {
      const message = (caught as { response?: { data?: { error?: { message?: string } } } })
        .response?.data?.error?.message;
      setError(
        message ?? (caught instanceof Error ? caught.message : 'Import failed / فشل الاستيراد')
      );
    } finally {
      setBusy(false);
    }
  };
  const next = () =>
    void perform(async () => {
      if (step === 1) {
        if (!file || !branchId) return;
        if (file.size > 750_000)
          throw new Error('CSV file cannot exceed 750 KB / حجم الملف يتجاوز الحد');
        const draft = await customerImportsApi.create(branchId, file.name, await file.text());
        setPreview(draft);
        setMapping(draft.columnMapping);
      }
      if (step === 2 && preview)
        setPreview(await customerImportsApi.update(preview.id, { columnMapping: mapping }));
      if (step === 4 && preview)
        setPreview(
          await customerImportsApi.update(preview.id, {
            decisions: preview.rows.map((row) => row.decision),
          })
        );
      if (step === 5 && preview) {
        setResult(
          await customerImportsApi.commit(
            preview.id,
            preview.rows.map((row) => row.decision),
            password
          )
        );
        setPassword('');
        void queryClient.invalidateQueries({
          predicate: (query) => isBranchDependentQuery(query.queryKey),
        });
      }
      setStep((value) => value + 1);
    });
  return (
    <Modal
      isOpen
      onClose={() => {
        if (!busy) onClose();
      }}
      title="Import customers from CSV / استيراد الزبائن"
      size="xl"
    >
      <CustomerImportWizard
        step={step}
        branchId={branchId}
        branchName={
          preview?.branch.name ??
          scope?.branches.find((branch) => branch.id === branchId)?.name ??
          ''
        }
        branches={scope?.branches ?? []}
        preview={preview}
        mapping={mapping}
        result={result}
        password={password}
        busy={busy}
        error={error}
        hasFile={Boolean(file)}
        onBranch={setBranchId}
        onFile={setFile}
        onMapping={setMapping}
        onPassword={setPassword}
        onDecision={(decision) =>
          setPreview((current) =>
            current
              ? {
                  ...current,
                  rows: current.rows.map((row) =>
                    row.rowNumber === decision.rowNumber ? { ...row, decision } : row
                  ),
                }
              : current
          )
        }
        onNext={next}
        onBack={() => setStep((value) => Math.max(preview ? 2 : 0, value - 1))}
        onRefresh={() => {
          if (preview)
            void perform(async () => {
              const updated = await customerImportsApi.update(preview.id, {
                columnMapping: preview.columnMapping,
              });
              setPreview(updated);
              setMapping(updated.columnMapping);
              setStep(3);
            });
        }}
      />
    </Modal>
  );
}
export function CustomerCsvImportDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  return open ? <CustomerImportSession onClose={onClose} /> : null;
}
