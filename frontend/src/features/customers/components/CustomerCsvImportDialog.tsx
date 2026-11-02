import { isBranchDependentQuery } from '../../branches/scope/branch-scope-store';
import { useContext, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Modal } from '../../../components/ui/Modal';
import { Button } from '../../../components/ui/Button';
import { ConfirmPopup } from '../../../components/ui/ConfirmPopup';
import { BranchScopeContext } from '../../branches/scope/BranchScopeProvider';
import { useCreateGuard, useRecordBranch } from '../../branches/scope/branch-ui';
import {
  customerImportsApi,
  importFields,
  type ImportMapping,
  type BalanceChange,
  type CustomerImportDecision,
  type CustomerImportPreview,
  type CustomerImportResult,
} from '../api/customer-import.api';

export const customerImportSteps = [
  'Default branch',
  'Upload',
  'Map columns',
  'Preview',
  'Resolve',
  'Confirm',
  'Result',
] as const;
const labels = {
  name: 'Name',
  phone: 'Phone',
  accountCode: 'Account number',
  address: 'Address',
  notes: 'Notes',
  creditLimit: 'Credit limit USD',
  openingBalance: 'Opening balance',
  currency: 'Currency',
  dueDate: 'Due date',
  isActive: 'Active',
  branch: 'Branch',
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
  dueDate: string;
  busy: boolean;
  error: string;
  hasFile: boolean;
  onBranch: (id: string) => void;
  onFile: (file: File | null) => void;
  onMapping: (mapping: ImportMapping) => void;
  onDecision: (decision: CustomerImportDecision) => void;
  onPassword: (password: string) => void;
  onDueDate: (dueDate: string) => void;
  onRowBranches: (rowNumbers: number[], branchId: string | null) => void;
  onNext: () => void;
  onBack: () => void;
  onRefresh: () => void;
}
const MONEY_CHANGES: BalanceChange['kind'][] = ['NEW', 'INCREASE', 'DECREASE'];
const CHANGED_FIRST: BalanceChange['kind'][] = ['DECREASE', 'INCREASE', 'CURRENCY_MISMATCH'];
export function balanceChangeText(balance: BalanceChange, currency: string): string | null {
  if (balance.kind === 'CURRENCY_MISMATCH') return 'Balance not compared: other currency';
  if (balance.kind !== 'INCREASE' && balance.kind !== 'DECREASE') return null;
  const money = (value: string) =>
    currency === 'USD' ? '$' + value : Number(value).toLocaleString('en-US') + ' ' + currency;
  const sign = balance.kind === 'INCREASE' ? '+' : '−';
  return (
    'Owes ' +
    money(balance.current) +
    ' now, file says ' +
    money(balance.file ?? '0') +
    ', change ' +
    sign +
    money(balance.difference.replace('-', ''))
  );
}
/** Rows whose money changes come first, so they are checked before confirming. */
export function rowsChangedFirst<T extends { balance: BalanceChange; rowNumber: number }>(
  rows: T[]
): T[] {
  const rank = (row: T) => (CHANGED_FIRST.includes(row.balance.kind) ? 0 : 1);
  return [...rows].sort((a, b) => rank(a) - rank(b) || a.rowNumber - b.rowNumber);
}
/** The popup text when a branch choice would move existing customers; null when none move. */
export function branchMoveMessage(
  rows: CustomerImportPreview['rows'],
  branchId: string,
  branchName: string
): string | null {
  const moving = rows.filter(
    (row) =>
      row.existingBranches.length > 0 &&
      !row.existingBranches.some((branch) => branch.id === branchId)
  );
  if (!moving.length) return null;
  const who =
    moving.length === 1
      ? '"' +
        moving[0].name +
        '" from ' +
        moving[0].existingBranches.map((branch) => branch.name).join(', ')
      : moving.length + ' customers who are already in another branch';
  return (
    'Move ' +
    who +
    ' to ' +
    branchName +
    '?\n\nTheir debts, payments and history move with them. No duplicate is created.'
  );
}
/** Rows per branch, so a branch change is visible without scrolling the whole table. */
export function rowsPerBranch(preview: CustomerImportPreview) {
  const counts = new Map<string, { name: string; rows: number }>();
  for (const row of preview.rows) {
    const entry = counts.get(row.branchId) ?? { name: row.branchName, rows: 0 };
    counts.set(row.branchId, { ...entry, rows: entry.rows + 1 });
  }
  return [...counts].map(([id, entry]) => ({ id, ...entry }));
}
export function importChangesMoney(result: CustomerImportResult): boolean {
  return Boolean(result.openingDebts || result.balanceIncreases || result.balancePayments);
}
export function importNeedsResolution(preview: CustomerImportPreview): boolean {
  const keys = new Set<string>();
  const phones = new Set<string>();
  const targets = new Set<string>();
  return preview.rows.some((row) => {
    const d = row.decision;
    if (d.action === 'SKIP') return false;
    const key = row.branchId + (row.identityKey ?? row.phoneKey);
    const phone = row.phoneKey && row.branchId + row.phoneKey;
    if (
      keys.has(key) ||
      (phone && phones.has(phone)) ||
      (d.targetCustomerId && targets.has(d.targetCustomerId))
    )
      return true;
    keys.add(key);
    if (phone) phones.add(phone);
    if (d.targetCustomerId) targets.add(d.targetCustomerId);
    return (
      row.status === 'INVALID' ||
      row.conflicts.some(
        (conflict) => conflict.kind === 'IDENTITY_MISMATCH' || conflict.kind === 'BRANCH_AMBIGUOUS'
      ) ||
      (d.action === 'CREATE' && row.matches.length > 0 && row.matchedBy !== 'NAME') ||
      (d.action === 'UPDATE' &&
        (row.matches.length !== 1 || d.targetCustomerId !== row.matches[0].id))
    );
  });
}
export function CustomerImportSummary({ result }: { result: CustomerImportResult }) {
  return (
    <dl className="grid grid-cols-2 gap-3 rounded-lg bg-slate-50 p-4 text-sm">
      {[
        ['Created', result.created],
        ['Updated', result.updated],
        ['Skipped', result.skipped],
        ['Moved to another branch', result.moved],
        ['Opening debts', result.openingDebts],
        ['Opening debts total USD', '$' + result.openingDebtTotalUsd],
        ['Balance increases', result.balanceIncreases],
        ['Balance increases total USD', '$' + result.balanceIncreaseTotalUsd],
        ['Customers paying down', result.balancePayments],
        ['Payments total USD', '$' + result.balancePaymentTotalUsd],
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
  const needsPassword = step === 5 && Boolean(preview && importChangesMoney(preview.planned));
  const needsDueDate = step === 5 && Boolean(preview?.planned.dueDateRequired);
  const choosableBranches = preview?.branches ?? [];
  const unresolved = preview ? importNeedsResolution(preview) : false;
  const disabled =
    props.busy ||
    (step === 0 && !props.branchId) ||
    (step === 1 && !props.hasFile) ||
    (step === 2 &&
      (props.mapping.name == null ||
        (props.mapping.phone == null && props.mapping.accountCode == null))) ||
    (step === 4 && unresolved) ||
    (needsDueDate && !props.dueDate) ||
    (needsPassword && !props.password);
  return (
    <div className="space-y-4">
      <p className="rounded-lg border border-brand-200 bg-brand-50 p-3 font-semibold" role="status">
        Default branch: <span dir="auto">{props.branchName || 'Select a branch'}</span>
      </p>
      <ol className="flex flex-wrap gap-2 text-xs" aria-label="Import steps">
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
            Refresh preview
          </button>
        </div>
      )}
      {step === 0 && (
        <label className="block text-sm">
          Default branch
          <span className="mt-1 block text-xs text-slate-500">
            Customers found in another branch go there, and you can change any customer's branch in
            the preview.
          </span>
          <select
            aria-label="Default branch"
            className={control + ' mt-2 block w-full'}
            value={props.branchId}
            onChange={(event) => props.onBranch(event.target.value)}
          >
            <option value="">Select a branch</option>
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
          CSV file (750 KB, 2,000 rows)
          <input
            aria-label="CSV file"
            className="mt-2 block"
            type="file"
            accept=".csv,text/csv"
            onChange={(event) => props.onFile(event.target.files?.[0] ?? null)}
          />
        </label>
      )}
      {step === 2 && (
        <div className="grid gap-3 sm:grid-cols-2">
          <p className="text-sm text-slate-600 sm:col-span-2">
            {preview?.format === 'TRIAL_BALANCE' &&
              'Trial-balance account table detected. Balance Debit supplies the opening debt. '}
            Map Name and either Account number or Phone. Phone is optional when an account number is
            supplied. Map Branch to send customers to the branch code or name in that column.
          </p>
          {importFields.map((field) => (
            <label key={field} className="text-sm">
              {labels[field]}
              {field === 'name' && ' *'}
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
                <option value="">Ignore</option>
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
              This file was already imported into this branch. Matching rows default to SKIP.
            </p>
          )}
          <p className="text-sm">
            Ready: {preview.summary.ready} · Conflicts: {preview.summary.conflicts} · Invalid:{' '}
            {preview.summary.invalid}
          </p>
          {choosableBranches.length > 1 && (
            <div className="space-y-1">
              <label className="block text-sm">
                Set all rows to
                <select
                  aria-label="Set all rows to branch"
                  className={control + ' ml-2'}
                  value={rowsPerBranch(preview).length === 1 ? rowsPerBranch(preview)[0].id : ''}
                  disabled={props.busy}
                  onChange={(event) => {
                    if (event.target.value)
                      props.onRowBranches(
                        preview.rows.map((row) => row.rowNumber),
                        event.target.value
                      );
                  }}
                >
                  <option value="">
                    {rowsPerBranch(preview).length > 1 ? 'Mixed branches' : 'Choose a branch'}
                  </option>
                  {choosableBranches.map((branch) => (
                    <option key={branch.id} value={branch.id} dir="auto">
                      {branch.name}
                    </option>
                  ))}
                </select>
              </label>
              <p role="status" className="text-sm text-slate-600">
                {props.busy
                  ? 'Updating branches…'
                  : rowsPerBranch(preview).map((item, index) => (
                      <span key={item.id}>
                        {index > 0 && ' · '}
                        <span dir="auto">{item.name}</span>: {item.rows}{' '}
                        {item.rows === 1 ? 'row' : 'rows'}
                      </span>
                    ))}
              </p>
              {preview.rows.some((row) => row.chosenBranch) && (
                <button
                  type="button"
                  className="text-sm font-medium text-brand-700 underline"
                  disabled={props.busy}
                  onClick={() =>
                    props.onRowBranches(
                      preview.rows.filter((row) => row.chosenBranch).map((row) => row.rowNumber),
                      null
                    )
                  }
                >
                  Keep every customer in their own branch
                </button>
              )}
            </div>
          )}
          <div className="max-h-[45vh] overflow-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr>
                  <th>Row</th>
                  <th>Customer</th>
                  <th>Branch</th>
                  <th>Status</th>
                  <th>Issues</th>
                  {step === 4 && <th>Decision</th>}
                </tr>
              </thead>
              <tbody>
                {rowsChangedFirst(preview.rows).map((row) => (
                  <tr key={row.rowNumber} className="border-b border-slate-200 align-top">
                    <td className="p-2">{row.rowNumber}</td>
                    <td className="p-2">
                      <span dir="auto">{row.name}</span>
                      <br />
                      {row.accountCode && (
                        <span>
                          Account: {row.accountCode}
                          <br />
                        </span>
                      )}
                      <span dir="auto">{row.phone || 'No phone supplied'}</span>
                      <br />
                      {row.openingBalance} {row.currency}
                      {balanceChangeText(row.balance, row.currency) && (
                        <p className="mt-1 font-semibold text-amber-800">
                          {balanceChangeText(row.balance, row.currency)}
                        </p>
                      )}
                    </td>
                    <td className="p-2">
                      {choosableBranches.length > 1 ? (
                        <select
                          aria-label={'Branch for row ' + row.rowNumber}
                          className={control}
                          value={row.branchId}
                          disabled={props.busy}
                          onChange={(event) =>
                            props.onRowBranches([row.rowNumber], event.target.value)
                          }
                        >
                          {choosableBranches.map((branch) => (
                            <option key={branch.id} value={branch.id} dir="auto">
                              {branch.name}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <span dir="auto">{row.branchName}</span>
                      )}
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
                          <option value="SKIP">SKIP</option>
                          {row.status !== 'INVALID' &&
                            (!row.matches.length || row.matchedBy === 'NAME') && (
                              <option value="CREATE">
                                {row.matches.length ? 'ADD AS NEW' : 'CREATE'}
                              </option>
                            )}
                          {row.status !== 'INVALID' && row.matches.length === 1 && (
                            <option value="UPDATE">UPDATE</option>
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
                        {row.decision.action !== 'SKIP' &&
                          MONEY_CHANGES.includes(row.balance.kind) && (
                            <label className="block">
                              <input
                                type="checkbox"
                                checked={!row.decision.skipOpeningBalance}
                                onChange={(event) =>
                                  props.onDecision({
                                    ...row.decision,
                                    skipOpeningBalance: !event.target.checked,
                                  })
                                }
                              />{' '}
                              {row.balance.kind === 'NEW'
                                ? 'Add opening amount'
                                : 'Apply this change'}
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
              Skip invalid rows, choose one row per account or phone in each branch, and choose a
              branch where a customer exists in several.
            </p>
          )}
        </>
      )}
      {step === 5 && preview && (
        <>
          <CustomerImportSummary result={preview.planned} />
          <p className="text-xs text-slate-500">
            LBP amounts use the current exchange rate at commit. Payments count as money received
            today, with payment method Other.
          </p>
          {needsDueDate && (
            <label className="block text-sm">
              Due date for new debts
              <span className="block text-xs text-slate-500">
                A due date in the file is used first for its row.
              </span>
              <input
                aria-label="Due date for new debts"
                className={control + ' mt-2 block w-full'}
                type="date"
                value={props.dueDate}
                onChange={(event) => props.onDueDate(event.target.value)}
              />
            </label>
          )}
          {needsPassword && (
            <label className="block text-sm">
              Account password
              <input
                aria-label="Account password"
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
            download="customer-import-report.csv"
            href={
              'data:text/csv;charset=utf-8,' +
              encodeURIComponent('\uFEFF' + (props.result.reportCsv ?? ''))
            }
          >
            Download import report
          </a>
        </>
      )}
      {step < 6 && (
        <div className="flex justify-end gap-2">
          {(step === 1 || step > 2) && (
            <Button variant="secondary" onClick={props.onBack} disabled={props.busy}>
              Back
            </Button>
          )}
          <Button onClick={props.onNext} disabled={disabled} isLoading={props.busy}>
            {step === 5 ? 'Commit import' : 'Continue'}
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
  const [dueDate, setDueDate] = useState('');
  const [pendingMove, setPendingMove] = useState<{
    rowNumbers: number[];
    branchId: string;
    message: string;
  } | null>(null);
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
      setError(message ?? (caught instanceof Error ? caught.message : 'Import failed'));
    } finally {
      setBusy(false);
    }
  };
  const applyRowBranches = (rowNumbers: number[], branchId: string | null) => {
    if (preview)
      void perform(async () =>
        setPreview(
          await customerImportsApi.update(preview.id, {
            decisions: preview.rows.map((row) => row.decision),
            rowBranches: rowNumbers.map((rowNumber) => ({ rowNumber, branchId })),
          })
        )
      );
  };
  const next = () =>
    void perform(async () => {
      if (step === 1) {
        if (!file || !branchId) return;
        if (file.size > 750_000) throw new Error('CSV file cannot exceed 750 KB');
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
            password,
            preview.planned.dueDateRequired ? dueDate : undefined
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
    <>
      <Modal
        isOpen
        onClose={() => {
          if (!busy) onClose();
        }}
        title="Import customers from CSV"
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
          dueDate={dueDate}
          busy={busy}
          error={error}
          hasFile={Boolean(file)}
          onBranch={setBranchId}
          onFile={setFile}
          onMapping={setMapping}
          onPassword={setPassword}
          onDueDate={setDueDate}
          onRowBranches={(rowNumbers, chosenBranchId) => {
            if (!preview) return;
            if (chosenBranchId) {
              const message = branchMoveMessage(
                preview.rows.filter((row) => rowNumbers.includes(row.rowNumber)),
                chosenBranchId,
                preview.branches.find((branch) => branch.id === chosenBranchId)?.name ?? ''
              );
              if (message) {
                setPendingMove({ rowNumbers, branchId: chosenBranchId, message });
                return;
              }
            }
            applyRowBranches(rowNumbers, chosenBranchId);
          }}
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
      {pendingMove && (
        <ConfirmPopup
          title="Change branch?"
          message={pendingMove.message}
          onCancel={() => setPendingMove(null)}
          onConfirm={() => {
            applyRowBranches(pendingMove.rowNumbers, pendingMove.branchId);
            setPendingMove(null);
          }}
        />
      )}
    </>
  );
}
export function CustomerCsvImportDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  return open ? <CustomerImportSession onClose={onClose} /> : null;
}
