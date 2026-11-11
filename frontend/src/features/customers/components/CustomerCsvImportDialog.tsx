import { isBranchDependentQuery } from '../../branches/scope/branch-scope-store';
import React, { useContext, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangle,
  Check,
  CircleSlash,
  Eye,
  MinusCircle,
  PlusCircle,
  RefreshCw,
  XCircle,
} from 'lucide-react';
import { Modal } from '../../../components/ui/Modal';
import { Button } from '../../../components/ui/Button';
import { Badge, type BadgeTone } from '../../../components/ui/Badge';
import { ConfirmPopup } from '../../../components/ui/ConfirmPopup';
import { cn } from '../../../lib/cn';
import { BranchScopeContext } from '../../branches/scope/BranchScopeProvider';
import { useCreateGuard, useRecordBranch } from '../../branches/scope/branch-ui';
import { formatMoney, formatSignedMoney } from '../../customer-financial/utils/financial-format';
import {
  customerImportsApi,
  importFields,
  type ImportMapping,
  type BalanceChange,
  type CustomerImportDecision,
  type CustomerImportPreview,
  type CustomerImportResult,
  type ImportBranchTotal,
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
const control =
  'rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30 disabled:bg-slate-50';
/** The main branch keeps the shop's own records; a file is never imported into it. */
export const isMainBranch = (branch: { code?: string | null }) =>
  branch.code?.trim().toUpperCase() === 'MAIN';

type PreviewRow = CustomerImportPreview['rows'][number];
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
const addsDeposit = (balance: BalanceChange) => balance.deposit?.kind === 'ADD';
const rowMoney = (value: string, currency: string) =>
  currency === 'USD' ? '$' + value : Number(value).toLocaleString('en-US') + ' ' + currency;

export function balanceChangeText(balance: BalanceChange, currency: string): string | null {
  if (balance.kind === 'CURRENCY_MISMATCH') return 'Balance not compared: other currency';
  if (balance.kind !== 'INCREASE' && balance.kind !== 'DECREASE') return null;
  const sign = balance.kind === 'INCREASE' ? '+' : '−';
  return (
    'Owes ' +
    rowMoney(balance.current, currency) +
    ' now, file says ' +
    rowMoney(balance.file ?? '0', currency) +
    ', change ' +
    sign +
    rowMoney(balance.difference.replace('-', ''), currency)
  );
}
/** The deposit line for a credit balance in the file, or null when the deposit is unchanged. */
export function depositChangeText(balance: BalanceChange, currency: string): string | null {
  const deposit = balance.deposit;
  if (!deposit || deposit.kind === 'NONE') return null;
  if (deposit.kind === 'LOWER')
    return (
      'Deposit held ' +
      rowMoney(deposit.current, currency) +
      ', file says ' +
      rowMoney(deposit.file, currency) +
      '; not changed'
    );
  return Number(deposit.current)
    ? 'Deposit held ' +
        rowMoney(deposit.current, currency) +
        ', add ' +
        rowMoney(deposit.difference, currency)
    : 'Deposit ' + rowMoney(deposit.difference, currency) + ' (credit balance)';
}
/** Rows whose money changes come first, so they are checked before confirming. */
export function rowsChangedFirst<T extends { balance: BalanceChange; rowNumber: number }>(
  rows: T[]
): T[] {
  const rank = (row: T) =>
    CHANGED_FIRST.includes(row.balance.kind) || addsDeposit(row.balance) ? 0 : 1;
  return [...rows].sort((a, b) => rank(a) - rank(b) || a.rowNumber - b.rowNumber);
}

/**
 * Each row belongs to exactly one group. A customer the file already knows by
 * account or phone is an update, not a conflict: the conflict group holds only
 * rows that need a person to decide or check something.
 */
export type RowGroup = 'conflict' | 'invalid' | 'new' | 'update' | 'unchanged' | 'skipped';
const DECIDE_KINDS = new Set([
  'BRANCH_AMBIGUOUS',
  'FILE_ACCOUNT',
  'FILE_PHONE',
  'IDENTITY_MISMATCH',
  'EXISTING_NAME',
]);
const CHECK_KINDS = new Set([
  'MAIN_BRANCH_MATCH',
  'NAME_ONE_LETTER',
  'NAME_SIMILAR',
  'BALANCE_ACTIVITY',
  'BALANCE_CURRENCY',
  'DEPOSIT_LOWER',
  'CUSTOMER_MOVE',
]);
const needsDecision = (row: PreviewRow) =>
  row.matches.length > 1 || row.conflicts.some((conflict) => DECIDE_KINDS.has(conflict.kind));
const needsCheck = (row: PreviewRow) =>
  row.conflicts.some((conflict) => CHECK_KINDS.has(conflict.kind));
const changesMoneyOnRow = (row: PreviewRow) =>
  row.decision.action !== 'SKIP' &&
  !row.decision.skipOpeningBalance &&
  (MONEY_CHANGES.includes(row.balance.kind) || addsDeposit(row.balance));
export function rowGroup(row: PreviewRow): RowGroup {
  if (row.status === 'INVALID') return 'invalid';
  if (needsDecision(row) || needsCheck(row)) return 'conflict';
  if (row.decision.action === 'SKIP') return 'skipped';
  if (row.decision.action === 'CREATE') return 'new';
  return changesMoneyOnRow(row) ? 'update' : 'unchanged';
}
const GROUPS: Array<{
  id: RowGroup;
  label: string;
  hint: string;
  tone: BadgeTone;
  icon: React.ReactNode;
  tint: string;
  dot: string;
}> = [
  {
    id: 'conflict',
    label: 'Conflict',
    hint: 'Choose what happens, or check a warning, before you continue.',
    tone: 'warning',
    icon: <AlertTriangle />,
    tint: 'bg-amber-50/80',
    dot: 'bg-amber-500',
  },
  {
    id: 'invalid',
    label: 'Invalid',
    hint: 'Cannot be imported. Fix these rows in the file, or leave them skipped.',
    tone: 'danger',
    icon: <XCircle />,
    tint: 'bg-red-50/80',
    dot: 'bg-red-500',
  },
  {
    id: 'new',
    label: 'New',
    hint: 'New customers that will be added, with their opening balance or deposit.',
    tone: 'success',
    icon: <PlusCircle />,
    tint: 'bg-green-50/70',
    dot: 'bg-green-500',
  },
  {
    id: 'update',
    label: 'Update',
    hint: 'Existing customers whose balance or deposit changes to match the file.',
    tone: 'brand',
    icon: <RefreshCw />,
    tint: 'bg-brand-50/70',
    dot: 'bg-brand-500',
  },
  {
    id: 'unchanged',
    label: 'No change',
    hint: 'Existing customers whose balance already matches the file.',
    tone: 'neutral',
    icon: <MinusCircle />,
    tint: '',
    dot: 'bg-slate-400',
  },
  {
    id: 'skipped',
    label: 'Skipped',
    hint: 'Rows you chose not to import.',
    tone: 'neutral',
    icon: <CircleSlash />,
    tint: 'bg-slate-50 text-slate-500',
    dot: 'bg-slate-300',
  },
];
const groupOf = (id: RowGroup) => GROUPS.find((group) => group.id === id)!;
export function rowsPerGroup(rows: PreviewRow[]) {
  const counts = new Map<RowGroup, number>();
  for (const row of rows) counts.set(rowGroup(row), (counts.get(rowGroup(row)) ?? 0) + 1);
  return counts;
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
  return Boolean(
    result.openingDebts || result.balanceIncreases || result.balancePayments || result.deposits
  );
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
  const items: Array<[string, string | number]> = [
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
    ...(result.deposits !== undefined
      ? ([
          ['Deposits', result.deposits],
          ['Deposits total USD', '$' + (result.depositTotalUsd ?? '0.00')],
        ] as Array<[string, string | number]>)
      : []),
  ];
  return (
    <dl className="grid grid-cols-2 gap-x-6 gap-y-3 rounded-xl border border-slate-200 bg-slate-50/70 p-4 text-sm sm:grid-cols-4">
      {items.map(([label, value]) => (
        <div key={label}>
          <dt className="text-slate-500">{label}</dt>
          <dd className="font-semibold tabular-nums text-slate-900">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

/** Adds the branch lines into one grand-total line. */
export function totalOfBranches(lines: ImportBranchTotal[]): ImportBranchTotal {
  const add = (pick: (line: ImportBranchTotal) => string) =>
    (lines.reduce((sum, line) => sum + Math.round(Number(pick(line)) * 100), 0) / 100).toFixed(2);
  const count = (pick: (line: ImportBranchTotal) => number) =>
    lines.reduce((sum, line) => sum + pick(line), 0);
  return {
    branchId: 'total',
    branchName: 'Total',
    rows: count((line) => line.rows),
    created: count((line) => line.created),
    updated: count((line) => line.updated),
    skipped: count((line) => line.skipped),
    invalid: count((line) => line.invalid),
    conflicts: count((line) => line.conflicts),
    fileDebtUsd: add((line) => line.fileDebtUsd),
    fileDepositUsd: add((line) => line.fileDepositUsd),
    newDebtUsd: add((line) => line.newDebtUsd),
    increaseUsd: add((line) => line.increaseUsd),
    paymentUsd: add((line) => line.paymentUsd),
    depositUsd: add((line) => line.depositUsd),
    netDebtChangeUsd: add((line) => line.netDebtChangeUsd),
    openBeforeUsd: add((line) => line.openBeforeUsd),
    openAfterUsd: add((line) => line.openAfterUsd),
  };
}

/**
 * Posting summary per branch, the way an ERP shows an import before it is
 * posted: what the file says, what changes, and each branch's open balance
 * before and after. Amounts are USD.
 */
export function BranchReconciliation({ lines }: { lines: ImportBranchTotal[] }) {
  const total = totalOfBranches(lines);
  const cell = 'px-2.5 py-2.5 text-right tabular-nums whitespace-nowrap';
  const row = (line: ImportBranchTotal, isTotal = false) => (
    <tr
      key={line.branchId}
      className={cn(
        isTotal
          ? 'border-t-2 border-slate-300 bg-slate-50 font-semibold text-slate-900'
          : 'border-t border-slate-100'
      )}
    >
      <th scope="row" className="w-40 px-3 py-2.5 text-left font-semibold text-slate-900">
        <span dir="auto">{line.branchName}</span>
        <span className="block text-xs font-normal text-slate-500">
          {line.created} new · {line.updated} update · {line.skipped} skip
        </span>
      </th>
      <td className={cell}>{formatMoney(line.fileDebtUsd)}</td>
      <td className={cell}>{formatMoney(line.fileDepositUsd)}</td>
      <td className={cn(cell, 'text-slate-700')}>{formatMoney(line.newDebtUsd)}</td>
      <td className={cn(cell, 'text-slate-700')}>{formatMoney(line.increaseUsd)}</td>
      <td className={cn(cell, 'text-green-700')}>
        {Number(line.paymentUsd) ? '−' + formatMoney(line.paymentUsd) : formatMoney('0.00')}
      </td>
      <td className={cn(cell, 'text-green-700')}>{formatMoney(line.depositUsd)}</td>
      <td className={cn(cell, 'font-semibold')}>{formatSignedMoney(line.netDebtChangeUsd)}</td>
      <td className={cn(cell, 'text-slate-600')}>{formatMoney(line.openBeforeUsd)}</td>
      <td className={cn(cell, 'font-semibold text-slate-900')}>{formatMoney(line.openAfterUsd)}</td>
    </tr>
  );
  return (
    <section aria-labelledby="branch-totals-heading" className="space-y-2">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h4 id="branch-totals-heading" className="text-base font-semibold text-slate-900">
          Totals by branch
        </h4>
        <p className="text-xs text-slate-500">USD. Skipped rows are left out.</p>
      </div>
      <div className="overflow-x-auto rounded-xl border border-slate-200">
        <table className="w-full min-w-[52rem] text-[13px]">
          <thead className="bg-slate-50 text-xs font-semibold text-slate-600">
            <tr>
              <th scope="col" className="px-3 py-2 text-left">
                Branch
              </th>
              <th scope="col" className="px-2.5 py-2 text-right leading-tight">
                File debt
              </th>
              <th scope="col" className="px-2.5 py-2 text-right leading-tight">
                File deposits
              </th>
              <th scope="col" className="px-2.5 py-2 text-right leading-tight">
                New debt
              </th>
              <th scope="col" className="px-2.5 py-2 text-right leading-tight">
                Increases
              </th>
              <th scope="col" className="px-2.5 py-2 text-right leading-tight">
                Payments
              </th>
              <th scope="col" className="px-2.5 py-2 text-right leading-tight">
                Deposits
              </th>
              <th scope="col" className="px-2.5 py-2 text-right leading-tight">
                Net debt change
              </th>
              <th scope="col" className="px-2.5 py-2 text-right leading-tight">
                Owed now
              </th>
              <th scope="col" className="px-2.5 py-2 text-right leading-tight">
                Owed after import
              </th>
            </tr>
          </thead>
          <tbody>{lines.map((line) => row(line))}</tbody>
          {lines.length > 1 && <tfoot>{row(total, true)}</tfoot>}
        </table>
      </div>
      <p className="text-xs text-slate-500">
        &quot;Owed now&quot; is what every active customer in the branch owes in HomeConnect,
        including customers not in this file. Compare &quot;Owed after import&quot; with the old
        system&apos;s total for that branch.
      </p>
    </section>
  );
}

/** Read-only list of rows that look like a customer already kept in the main branch. */
export function MainBranchCheck({ rows }: { rows: PreviewRow[] }) {
  const flagged = rows.filter((row) => row.mainMatches?.length);
  if (!flagged.length) return null;
  const how = {
    ACCOUNT: 'same account',
    PHONE: 'same phone',
    NAME: 'same name',
    SIMILAR_NAME: 'one letter different',
  } as const;
  return (
    <section
      aria-labelledby="main-check-heading"
      className="space-y-2 rounded-xl border border-amber-200 bg-amber-50/60 p-4"
    >
      <h4
        id="main-check-heading"
        className="flex items-center gap-2 text-base font-semibold text-amber-900"
      >
        <Eye className="h-4 w-4" aria-hidden="true" />
        Main branch check
      </h4>
      <p className="text-sm text-amber-900/80">
        These customers may already have a debt in the main branch. The import never changes the
        main branch; make sure the same debt is not counted twice.
      </p>
      <ul className="divide-y divide-amber-200/70 text-sm">
        {flagged.flatMap((row) =>
          (row.mainMatches ?? []).map((match) => (
            <li key={row.rowNumber + match.id} className="flex flex-wrap gap-x-3 gap-y-1 py-2">
              <span className="font-medium text-slate-900" dir="auto">
                Row {row.rowNumber}: {row.name}
              </span>
              <span className="text-slate-600">
                {row.decision.action === 'SKIP' ? 'skipped' : 'into ' + row.branchName} · matches{' '}
                <span dir="auto">“{match.name}”</span> ({how[match.matchedBy]}) in{' '}
                <span dir="auto">{match.branchName}</span>, owes{' '}
                <span className="font-semibold tabular-nums">{formatMoney(match.balanceUsd)}</span>
              </span>
            </li>
          ))
        )}
      </ul>
    </section>
  );
}

function StepTrail({ step }: { step: number }) {
  return (
    <ol className="flex flex-wrap items-center gap-x-1 gap-y-2 text-xs" aria-label="Import steps">
      {customerImportSteps.map((label, index) => {
        const done = index < step;
        const current = index === step;
        return (
          <li
            key={label}
            aria-current={current ? 'step' : undefined}
            className="flex items-center gap-1"
          >
            <span
              className={cn(
                'flex items-center gap-1.5 rounded-full px-2.5 py-1 font-medium',
                current && 'bg-brand-600 text-white',
                done && 'bg-brand-50 text-brand-700',
                !current && !done && 'text-slate-500'
              )}
            >
              <span
                aria-hidden="true"
                className={cn(
                  'flex h-4 w-4 items-center justify-center rounded-full text-[10px] tabular-nums',
                  current && 'bg-white/20',
                  done && 'bg-brand-600 text-white',
                  !current && !done && 'bg-slate-200 text-slate-600'
                )}
              >
                {done ? <Check className="h-3 w-3" /> : index + 1}
              </span>
              {label}
            </span>
            {index < customerImportSteps.length - 1 && (
              <span aria-hidden="true" className="h-px w-3 bg-slate-300" />
            )}
          </li>
        );
      })}
    </ol>
  );
}

function GroupFilter({
  counts,
  active,
  onChange,
  total,
}: {
  counts: Map<RowGroup, number>;
  active: RowGroup | 'all';
  onChange: (group: RowGroup | 'all') => void;
  total: number;
}) {
  const button = (selected: boolean) =>
    cn(
      'inline-flex items-center gap-2 rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/50',
      selected
        ? 'border-slate-900 bg-slate-900 text-white'
        : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50'
    );
  return (
    <div role="group" aria-label="Show rows" className="flex flex-wrap gap-2">
      <button
        type="button"
        aria-pressed={active === 'all'}
        className={button(active === 'all')}
        onClick={() => onChange('all')}
      >
        All <span className="tabular-nums opacity-70">{total}</span>
      </button>
      {GROUPS.filter((group) => counts.get(group.id)).map((group) => (
        <button
          key={group.id}
          type="button"
          aria-pressed={active === group.id}
          className={button(active === group.id)}
          onClick={() => onChange(group.id)}
        >
          <span aria-hidden="true" className={cn('h-2.5 w-2.5 rounded-full', group.dot)} />
          {group.label} <span className="tabular-nums opacity-70">{counts.get(group.id)}</span>
        </button>
      ))}
    </div>
  );
}

function BalanceCell({ row }: { row: PreviewRow }) {
  const change = balanceChangeText(row.balance, row.currency);
  const deposit = depositChangeText(row.balance, row.currency);
  const fileDeposit = row.deposit && Number(row.deposit) ? row.deposit : null;
  return (
    <div className="space-y-0.5 tabular-nums">
      <p className="font-medium text-slate-900">
        {fileDeposit
          ? 'Credit ' + rowMoney(fileDeposit, row.currency)
          : rowMoney(row.openingBalance, row.currency)}
      </p>
      {row.balance.kind === 'NEW' && !row.decision.skipOpeningBalance && (
        <p className="text-xs text-green-700">Opening debt</p>
      )}
      {change && <p className="text-xs font-semibold text-amber-800">{change}</p>}
      {deposit && (
        <p
          className={cn(
            'text-xs font-semibold',
            row.balance.deposit?.kind === 'LOWER' ? 'text-amber-800' : 'text-green-700'
          )}
        >
          {deposit}
        </p>
      )}
    </div>
  );
}

export function CustomerImportWizard(props: WizardProps) {
  const { step, preview } = props;
  const counts = preview ? rowsPerGroup(preview.rows) : new Map<RowGroup, number>();
  const firstGroup: RowGroup | 'all' = counts.get('conflict')
    ? 'conflict'
    : counts.get('invalid')
      ? 'invalid'
      : 'all';
  const [chosenGroup, setGroup] = useState<RowGroup | 'all' | null>(null);
  const group =
    chosenGroup && (chosenGroup === 'all' || counts.get(chosenGroup)) ? chosenGroup : firstGroup;
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
  const visibleRows = preview
    ? rowsChangedFirst(
        group === 'all' ? preview.rows : preview.rows.filter((row) => rowGroup(row) === group)
      )
    : [];
  const mainFlagged = preview?.rows.filter((row) => row.mainMatches?.length).length ?? 0;
  return (
    <div className="space-y-5">
      <div className="space-y-3">
        <p
          className="flex flex-wrap items-center gap-2 text-sm font-semibold text-slate-800"
          role="status"
        >
          Default branch:{' '}
          <span
            dir="auto"
            className="rounded-md bg-brand-50 px-2 py-0.5 text-brand-800 ring-1 ring-inset ring-brand-200"
          >
            {props.branchName || 'Select a branch'}
          </span>
          {preview && (
            <span className="font-normal text-slate-500" dir="auto">
              · {preview.fileName}
            </span>
          )}
        </p>
        <StepTrail step={step} />
      </div>
      <h3 className="text-lg font-semibold text-slate-900">{customerImportSteps[step]}</h3>
      {props.error && (
        <div
          role="alert"
          className="flex flex-wrap items-center gap-3 rounded-lg bg-red-50 p-3 text-sm text-red-700 ring-1 ring-inset ring-red-200"
        >
          <XCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
          <span className="min-w-0 flex-1">{props.error}</span>
          <button
            type="button"
            className="font-medium underline underline-offset-2"
            onClick={props.onRefresh}
            disabled={props.busy || !preview}
          >
            Refresh preview
          </button>
        </div>
      )}
      {step === 0 && (
        <label className="block max-w-xl text-sm">
          <span className="font-medium text-slate-800">Default branch</span>
          <span className="mt-1 block text-slate-500">
            Customers found in another branch go there, and you can change any customer&apos;s
            branch in the preview. The main branch is not offered: imports never write to it.
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
        <label className="block max-w-xl rounded-xl border-2 border-dashed border-slate-300 bg-slate-50/60 p-6 text-sm">
          <span className="font-medium text-slate-800">CSV file</span>
          <span className="mt-1 block text-slate-500">
            Up to 750 KB and 2,000 rows. A trial balance from the old system is detected
            automatically; credit balances become deposits.
          </span>
          <input
            aria-label="CSV file"
            className="mt-3 block text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-brand-600 file:px-3 file:py-2 file:font-medium file:text-white hover:file:bg-brand-700"
            type="file"
            accept=".csv,text/csv"
            onChange={(event) => props.onFile(event.target.files?.[0] ?? null)}
          />
        </label>
      )}
      {step === 2 && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <p className="text-sm text-slate-600 sm:col-span-2 lg:col-span-3">
            {preview?.format === 'TRIAL_BALANCE' &&
              'Trial-balance account table detected. Balance Debit supplies the opening debt and Balance Credit becomes a deposit. '}
            Map Name and either Account number or Phone. Phone is optional when an account number is
            supplied. Map Branch to send customers to the branch code or name in that column.
          </p>
          {importFields.map((field) => (
            <label key={field} className="text-sm font-medium text-slate-700">
              {labels[field]}
              {field === 'name' && ' *'}
              <select
                className={control + ' mt-1 block w-full font-normal'}
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
            <p
              role="alert"
              className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900 ring-1 ring-inset ring-amber-200"
            >
              This file was already imported into this branch. Matching rows default to Skip.
            </p>
          )}
          {mainFlagged > 0 && (
            <p className="flex items-start gap-2 rounded-lg bg-amber-50 p-3 text-sm text-amber-900 ring-1 ring-inset ring-amber-200">
              <Eye className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              <span>
                {mainFlagged} {mainFlagged === 1 ? 'row looks' : 'rows look'} like a customer in the
                main branch. The main branch is read only here; these rows are in Conflict and
                listed again on the Confirm step.
              </span>
            </p>
          )}
          <div className="flex flex-wrap items-end justify-between gap-4">
            <GroupFilter
              counts={counts}
              active={group}
              onChange={setGroup}
              total={preview.rows.length}
            />
            {choosableBranches.length > 1 && (
              <div className="space-y-1 text-right">
                <label className="block text-sm text-slate-700">
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
                <p role="status" className="text-xs text-slate-500">
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
                    className="text-sm font-medium text-brand-700 underline underline-offset-2"
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
          </div>
          {group !== 'all' && <p className="text-sm text-slate-600">{groupOf(group).hint}</p>}
          <div className="h-[max(18rem,calc(90vh-33rem))] overflow-auto rounded-xl border border-slate-200">
            <table className="w-full min-w-[56rem] text-left text-sm">
              <thead className="sticky top-0 z-10 bg-slate-50 text-xs font-semibold text-slate-600 shadow-[0_1px_0_rgb(226_232_240)]">
                <tr>
                  <th scope="col" className="px-3 py-2">
                    Row
                  </th>
                  <th scope="col" className="px-3 py-2">
                    Status
                  </th>
                  <th scope="col" className="px-3 py-2">
                    Customer
                  </th>
                  <th scope="col" className="px-3 py-2">
                    Branch
                  </th>
                  <th scope="col" className="px-3 py-2">
                    Balance
                  </th>
                  <th scope="col" className="px-3 py-2">
                    Notes
                  </th>
                  {step === 4 && (
                    <th scope="col" className="px-3 py-2">
                      Decision
                    </th>
                  )}
                </tr>
              </thead>
              <tbody>
                {visibleRows.map((row) => {
                  const kind = groupOf(rowGroup(row));
                  const blocking = row.status !== 'INVALID' && needsDecision(row);
                  const notes = [
                    ...row.issues,
                    ...row.conflicts
                      .filter(
                        (conflict) =>
                          !(
                            row.matches.length === 1 &&
                            (conflict.kind === 'EXISTING_ACCOUNT' ||
                              conflict.kind === 'EXISTING_PHONE')
                          )
                      )
                      .map((conflict) => conflict.message),
                  ];
                  return (
                    <tr
                      key={row.rowNumber}
                      className={cn('border-t border-slate-200/80 align-top', kind.tint)}
                    >
                      <td className="px-3 py-2.5 tabular-nums text-slate-500">{row.rowNumber}</td>
                      <td className="px-3 py-2.5">
                        <Badge tone={kind.tone} icon={kind.icon}>
                          {kind.label}
                        </Badge>
                        {blocking && (
                          <span className="mt-1 block text-xs font-medium text-amber-800">
                            Needs a decision
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2.5">
                        <span dir="auto" className="font-medium text-slate-900">
                          {row.name}
                        </span>
                        <span className="block text-xs text-slate-500">
                          {row.accountCode && <>Account: {row.accountCode} · </>}
                          <span dir="auto">{row.phone || 'No phone supplied'}</span>
                        </span>
                        {row.matches.length === 1 && row.matchedBy && row.matchedBy !== 'MOVE' && (
                          <span className="block text-xs text-slate-500">
                            Matched by {row.matchedBy.toLowerCase()}
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2.5">
                        {choosableBranches.length > 1 ? (
                          <select
                            aria-label={'Branch for row ' + row.rowNumber}
                            className={control + ' py-1.5'}
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
                      <td className="px-3 py-2.5">
                        <BalanceCell row={row} />
                      </td>
                      <td className="max-w-xs px-3 py-2.5 text-xs text-slate-700">
                        {notes.length ? (
                          <ul className="space-y-1">
                            {notes.map((note, index) => (
                              <li key={index} dir="auto">
                                {note}
                              </li>
                            ))}
                          </ul>
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                      </td>
                      {step === 4 && (
                        <td className="space-y-2 px-3 py-2.5">
                          <select
                            aria-label={'Action for row ' + row.rowNumber}
                            className={control + ' py-1.5'}
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
                            <option value="SKIP">Skip</option>
                            {row.status !== 'INVALID' &&
                              (!row.matches.length || row.matchedBy === 'NAME') && (
                                <option value="CREATE">
                                  {row.matches.length ? 'Add as new' : 'Create'}
                                </option>
                              )}
                            {row.status !== 'INVALID' && row.matches.length === 1 && (
                              <option value="UPDATE">Update</option>
                            )}
                          </select>
                          {row.decision.action === 'UPDATE' &&
                            (['name', 'address', 'notes', 'creditLimit'] as const)
                              .filter(
                                (field) =>
                                  preview.columnMapping[field] != null && row[field] !== undefined
                              )
                              .map((field) => (
                                <label
                                  key={field}
                                  className="flex items-center gap-2 whitespace-nowrap text-xs"
                                >
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
                                  />
                                  Update {labels[field].toLowerCase()}
                                </label>
                              ))}
                          {row.decision.action !== 'SKIP' &&
                            (MONEY_CHANGES.includes(row.balance.kind) ||
                              addsDeposit(row.balance)) && (
                              <label className="flex items-center gap-2 whitespace-nowrap text-xs font-medium">
                                <input
                                  type="checkbox"
                                  checked={!row.decision.skipOpeningBalance}
                                  onChange={(event) =>
                                    props.onDecision({
                                      ...row.decision,
                                      skipOpeningBalance: !event.target.checked,
                                    })
                                  }
                                />
                                {row.balance.kind === 'NEW'
                                  ? 'Add opening amount'
                                  : MONEY_CHANGES.includes(row.balance.kind)
                                    ? 'Apply this change'
                                    : 'Record deposit'}
                              </label>
                            )}
                        </td>
                      )}
                    </tr>
                  );
                })}
                {!visibleRows.length && (
                  <tr>
                    <td
                      colSpan={step === 4 ? 7 : 6}
                      className="px-3 py-8 text-center text-slate-500"
                    >
                      No rows in this group.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          {step === 4 && unresolved && (
            <p role="alert" className="text-sm font-medium text-amber-800">
              Skip invalid rows, choose one row per account or phone in each branch, and choose a
              branch where a customer exists in several.
            </p>
          )}
        </>
      )}
      {step === 5 && preview && (
        <div className="space-y-5">
          <CustomerImportSummary result={preview.planned} />
          {preview.planned.branchTotals?.length ? (
            <BranchReconciliation lines={preview.planned.branchTotals} />
          ) : null}
          <MainBranchCheck rows={preview.rows} />
          <p className="text-xs text-slate-500">
            LBP amounts use the current exchange rate at commit. Payments count as money received
            today, with payment method Other. Deposits count as cash received today and appear on
            each customer&apos;s Deposits tab.
          </p>
          <div className="grid gap-4 sm:grid-cols-2">
            {needsDueDate && (
              <label className="block text-sm">
                <span className="font-medium text-slate-800">Due date for new debts</span>
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
                <span className="font-medium text-slate-800">Account password</span>
                <span className="block text-xs text-slate-500">
                  Required because this import changes money.
                </span>
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
          </div>
        </div>
      )}
      {step === 6 && props.result && (
        <div className="space-y-4">
          <p className="flex items-center gap-2 text-sm font-medium text-green-700">
            <Check className="h-4 w-4" aria-hidden="true" />
            Import committed.
          </p>
          <CustomerImportSummary result={props.result} />
          <a
            className="inline-block text-sm font-medium text-brand-700 underline underline-offset-2"
            download="customer-import-report.csv"
            href={
              'data:text/csv;charset=utf-8,' +
              encodeURIComponent('﻿' + (props.result.reportCsv ?? ''))
            }
          >
            Download import report
          </a>
        </div>
      )}
      {step < 6 && (
        <div className="sticky -bottom-6 z-20 -mx-6 -mb-6 flex items-center justify-end gap-2 border-t border-slate-200 bg-white/95 px-6 py-4 backdrop-blur-sm">
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
  const destinations = (scope?.branches ?? []).filter((branch) => !isMainBranch(branch));
  const selected = scope?.selectedBranch;
  const [branchId, setBranchId] = useState(
    guard.blocked || !selected || isMainBranch(selected) ? '' : selected.id
  );
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
        maxWidth="max-w-none sm:w-[70vw] sm:min-w-[40rem]"
      >
        <CustomerImportWizard
          step={step}
          branchId={branchId}
          branchName={
            preview?.branch.name ??
            destinations.find((branch) => branch.id === branchId)?.name ??
            ''
          }
          branches={destinations}
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
