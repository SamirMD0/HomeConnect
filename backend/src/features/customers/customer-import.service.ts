import { Prisma } from '@prisma/client';
import { AppError, AuthorizationError, NotFoundError, ValidationError } from '../../lib/errors';
import { importFileHash } from '../../lib/csv-import';
import { normalizePhoneTerm, normalizeSearchTerm } from '../../lib/search-normalize';
import { verifyAdminPassword } from '../../lib/admin-verification';
import { assertCreditLimitPermission } from '../../services/customers.service';
import { CustomerBranchTransferService } from './customer-branch-transfer.service';
import { assertInScope } from '../branches/branch-scope';
import { BranchesService, type BranchActor } from '../branches/branches.service';
import { runFinancialTransaction } from '../financial/infrastructure/transaction';
import { DebtsRepository } from '../financial/debts/debts.repository';
import { PrepaidRepository } from '../financial/prepaid/prepaid.repository';
import { DebtsService } from '../financial/debts/debts.service';
import { InstallmentPlansService } from '../financial/installment-plans/installment-plans.service';
import { ExchangeRatesService } from '../financial/exchange-rates/exchange-rates.service';
import { moneyToApiString, parseMoney, sumMoney, toBaseAmount } from '../financial/domain/money';
import {
  businessDateToPrisma,
  parseBusinessDate,
  todayInBusinessTimezone,
} from '../financial/domain/business-date';
import { calculateDebtBalance } from '../financial/domain/balances';
import { determineDebtStatus } from '../financial/domain/statuses';
import {
  classifyBalance,
  IMPORT_PAYMENT_KEY_PREFIX,
  loadCustomerBalances,
  planBalancePayments,
} from './customer-import-balance';
import {
  detectColumnMapping,
  mapCustomerRows,
  parseCustomerCsv,
  type ColumnMapping,
  type CsvDocument,
} from './customer-import.parser';
import {
  commitCustomerImportSchema,
  createCustomerImportSchema,
  updateCustomerImportSchema,
  type CustomerImportDecision,
  type CreateCustomerImportInput,
  type UpdateCustomerImportInput,
  type CommitCustomerImportInput,
} from './customer-import.validator';

type Client = Prisma.TransactionClient;
type Draft = Prisma.CustomerImportGetPayload<Record<string, never>>;
export interface ImportContext {
  requestId?: string | null;
  ipAddress?: string | null;
}
const json = (value: unknown) => value as Prisma.InputJsonValue;
const stale = (message: string) =>
  new AppError(
    message + ' Refresh the preview and resolve the row again.',
    409,
    'CUSTOMER_IMPORT_STALE'
  );
const unresolved = (message: string) => new AppError(message, 409, 'CUSTOMER_IMPORT_UNRESOLVED');

/** Re-read actor access inside each operation, including the commit transaction.
 * Imports choose their explicit destination independently of the header's read scope. */
async function checkedBranch(branchId: string, actor: BranchActor, tx: Client) {
  const user = await tx.user.findUnique({
    where: { id: actor.userId },
    select: { role: true, isActive: true, deletedAt: true },
  });
  if (!user || !user.isActive || user.deletedAt)
    throw new NotFoundError('Customer import not found');
  const currentActor = { userId: actor.userId, role: user.role };
  const branch = await tx.branch.findUnique({ where: { id: branchId } });
  // An inactive destination is still recognizable to its authorized users.
  if (!branch) throw new NotFoundError('Customer import not found');
  if (!branch.isActive) {
    if (
      user.role !== 'ADMIN' &&
      !(await tx.userBranchAccess.findUnique({
        where: { userId_branchId: { userId: actor.userId, branchId } },
      }))
    )
      throw new NotFoundError('Customer import not found');
    throw new AppError(
      'The destination branch is inactive',
      409,
      'CUSTOMER_IMPORT_BRANCH_INACTIVE'
    );
  }
  const accessible = await BranchesService.accessibleBranches(currentActor, tx);
  assertInScope(
    branch.id,
    { mode: 'all', branchIds: accessible.map((item) => item.id) },
    'Customer import not found'
  );
  if (actor.role !== 'ADMIN' || user.role !== 'ADMIN')
    throw new AuthorizationError('Only administrators can import customers');
  return branch;
}
async function findDraft(id: string, actor: BranchActor, tx: Client) {
  const draft = await tx.customerImport.findUnique({ where: { id } });
  if (!draft) throw new NotFoundError('Customer import not found');
  const branch = await checkedBranch(draft.branchId, actor, tx);
  return { draft, branch };
}
const assertDraft = (draft: Draft) => {
  if (draft.status !== 'DRAFT')
    throw new AppError('Customer import is already committed', 409, 'CUSTOMER_IMPORT_COMMITTED');
};

const MONEY_CHANGES = ['NEW', 'INCREASE', 'DECREASE'] as const;
type MoneyRow = {
  balance: { kind: string; deposit: { kind: string } };
  decision: Pick<CustomerImportDecision, 'action' | 'skipOpeningBalance'>;
};
const applies = (row: MoneyRow) =>
  row.decision.action !== 'SKIP' && !row.decision.skipOpeningBalance;
/** New debt, a balance increase, or payments that bring the debt down to the file. */
const changesDebt = (row: MoneyRow) =>
  applies(row) && (MONEY_CHANGES as readonly string[]).includes(row.balance.kind);
/** A credit balance in the file, recorded as a deposit held for the customer. */
const addsDeposit = (row: MoneyRow) => applies(row) && row.balance.deposit.kind === 'ADD';
/** The file shows less credit than the deposits an import holds: they were used there. */
const usesDeposit = (row: MoneyRow) => applies(row) && row.balance.deposit.kind === 'LOWER';
const changesMoney = (row: MoneyRow) => changesDebt(row) || addsDeposit(row) || usesDeposit(row);
const addsDebt = (row: MoneyRow) => changesDebt(row) && row.balance.kind !== 'DECREASE';
const absoluteDifference = (row: { balance: { difference: string }; currency: 'USD' | 'LBP' }) =>
  parseMoney(row.balance.difference, row.currency).abs();
const branchKey = (value: string) => value.trim().toLowerCase();
/** The main branch holds the shop's own older records; an import may read it, never write to it. */
const MAIN_BRANCH_CODE = 'MAIN';
export const isMainBranch = (branch: { code: string | null }) =>
  branch.code?.trim().toUpperCase() === MAIN_BRANCH_CODE;
const assertImportDestination = (branch: { code: string | null }) => {
  if (isMainBranch(branch))
    throw new ValidationError('The main branch cannot receive a CSV import; choose another branch');
};
/** Spaces carry no meaning in a name: "عبد السلام" and "عبدالسلام" are one person. */
const nameKey = (name: string) => normalizeSearchTerm(name).replace(/\s+/g, '');
/** True when two names differ by at most one added, removed or changed letter. */
export function withinOneEdit(a: string, b: string) {
  if (a === b) return true;
  if (Math.abs(a.length - b.length) > 1) return false;
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i++;
  if (a.length === b.length) return a.slice(i + 1) === b.slice(i + 1);
  return a.length > b.length ? a.slice(i + 1) === b.slice(i) : a.slice(i) === b.slice(i + 1);
}
/** Short names collide by chance; a one-letter difference only means something past this length. */
const SIMILAR_NAME_MIN_LENGTH = 5;
const similarName = (a: string, b: string) =>
  a !== b && Math.min(a.length, b.length) >= SIMILAR_NAME_MIN_LENGTH && withinOneEdit(a, b);

/** How many earlier committed imports are read to find an account's last file balance. */
const PREVIOUS_FILE_LOOKBACK = 60;
export interface PreviousFileBalance {
  balance: string;
  currency: 'USD' | 'LBP';
  fileName: string;
  committedAt: Date;
}
/**
 * The balance each account had in the newest earlier committed file. A trial balance that
 * still says the same thing is not news from the old system, whatever HomeConnect shows.
 */
export async function loadPreviousFileBalances(draftId: string, branchIds: string[], tx: Client) {
  const found = new Map<string, PreviousFileBalance>();
  const previous = await tx.customerImport.findMany({
    where: {
      status: 'COMMITTED',
      id: { not: draftId },
      committedAt: { not: null },
      branchId: { in: branchIds },
    },
    select: { branchId: true, fileName: true, committedAt: true, rows: true, columnMapping: true },
    orderBy: { committedAt: 'desc' },
    take: PREVIOUS_FILE_LOOKBACK,
  });
  for (const item of previous) {
    let parsed: ReturnType<typeof mapCustomerRows>;
    try {
      parsed = mapCustomerRows(
        item.rows as unknown as CsvDocument,
        item.columnMapping as ColumnMapping
      );
    } catch {
      continue;
    }
    for (const row of parsed) {
      const key = previousFileKey(item.branchId, row.accountCode);
      if (row.accountCode && row.hasBalance && !row.issues.length && !found.has(key))
        found.set(key, {
          balance: fileMoney(row.openingBalance, row.currency),
          currency: row.currency,
          fileName: item.fileName,
          committedAt: item.committedAt!,
        });
    }
  }
  return found;
}
function fileMoney(value: string, currency: 'USD' | 'LBP') {
  try {
    return moneyToApiString(parseMoney(value || '0', currency), currency);
  } catch {
    return value || '0';
  }
}
/** A branch's own import first, then the import holding the whole file. */
const previousFileKey = (branchId: string, accountCode: string) => branchId + ':' + accountCode;
const previousFileFor = (
  balances: Map<string, PreviousFileBalance>,
  branchIds: string[],
  accountCode: string
) =>
  branchIds.map((branchId) => balances.get(previousFileKey(branchId, accountCode))).find(Boolean);
const sameFileBalance = (
  previous: PreviousFileBalance | undefined,
  row: { openingBalance: string; currency: 'USD' | 'LBP' }
) => {
  if (!previous || previous.currency !== row.currency) return false;
  try {
    return parseMoney(previous.balance, row.currency).equals(
      parseMoney(row.openingBalance || '0', row.currency)
    );
  } catch {
    return false;
  }
};
const shortDate = (value: Date) => value.toISOString().slice(0, 10);

export type MissingDecision = 'SETTLE' | 'KEEP';
/**
 * Customers an earlier import brought in who still owe in HomeConnect but are not in this
 * trial balance. The old system leaves out accounts at zero, so a customer who paid in full
 * simply disappears from the file; settling records that payment here.
 */
async function findMissingCustomers({
  document,
  rows,
  previousFileBalances,
  branchName,
  draftBranchId,
  tx,
}: {
  document: CsvDocument;
  rows: Array<{ branchId: string; status: string; matches: Array<{ id: string }> }>;
  previousFileBalances: Map<string, PreviousFileBalance>;
  branchName: (id: string) => string;
  draftBranchId: string;
  tx: Client;
}) {
  // Only a full trial balance says anything about the accounts it leaves out.
  if (document.format !== 'TRIAL_BALANCE') return [];
  const covered = [
    ...new Set(rows.filter((row) => row.status !== 'INVALID').map((row) => row.branchId)),
  ];
  if (!covered.length) return [];
  const inFile = [...new Set(rows.flatMap((row) => row.matches.map((match) => match.id)))];
  const candidates = await tx.customer.findMany({
    where: {
      branchId: { in: covered },
      deletedAt: null,
      id: { notIn: inFile },
      OR: [
        { importAccounts: { some: {} } },
        { debts: { some: { sourceCustomerImportId: { not: null } } } },
      ],
    },
    select: {
      id: true,
      name: true,
      branchId: true,
      importAccounts: { select: { accountCode: true }, orderBy: { accountCode: 'asc' } },
    },
    orderBy: { name: 'asc' },
  });
  const balances = await loadCustomerBalances(
    candidates.map((customer) => customer.id),
    tx
  );
  return candidates.flatMap((customer) => {
    const state = balances.get(customer.id);
    if (!state?.obligations.length) return [];
    const owed = (['USD', 'LBP'] as const).flatMap((currency) => {
      const items = state.obligations.filter((item) => item.currency === currency);
      return items.length
        ? [
            {
              currency,
              amount: moneyToApiString(
                sumMoney(
                  items.map((item) => item.remaining),
                  currency
                ),
                currency
              ),
            },
          ]
        : [];
    });
    const accountCodes = customer.importAccounts.map((account) => account.accountCode);
    const seen = accountCodes
      .map((code) =>
        previousFileFor(previousFileBalances, [customer.branchId, draftBranchId], code)
      )
      .filter((item): item is PreviousFileBalance => Boolean(item))
      .sort((left, right) => right.committedAt.getTime() - left.committedAt.getTime())[0];
    // The old system wins: an account it no longer lists is at zero there. Activity taken
    // here since the last import is shown, so it can be entered in the old system.
    const decision: MissingDecision = document.missingDecisions?.[customer.id] ?? 'SETTLE';
    return [
      {
        customerId: customer.id,
        name: customer.name,
        branchId: customer.branchId,
        branchName: branchName(customer.branchId),
        accountCode: accountCodes[0] ?? null,
        owed,
        lastSeen: seen
          ? {
              fileName: seen.fileName,
              date: shortDate(seen.committedAt),
              balance: seen.balance,
              currency: seen.currency,
            }
          : null,
        activitySinceLastImport: state.activitySinceLastImport,
        decision,
        fingerprint: JSON.stringify([
          customer.branchId,
          state.obligations.map((item) => [item.id, item.remaining.toFixed(2)]),
          state.activitySinceLastImport,
        ]),
      },
    ];
  });
}

export async function buildCustomerImportPreview(draft: Draft, tx: Client) {
  const document = draft.rows as unknown as CsvDocument;
  const mapping = draft.columnMapping as ColumnMapping;
  const parsed = mapCustomerRows(document, mapping);
  const actor = await tx.user.findUniqueOrThrow({
    where: { id: draft.createdById },
    select: { role: true },
  });
  // Every target is limited to branches the draft owner can see.
  const accessible = await BranchesService.accessibleBranches(
    { userId: draft.createdById, role: actor.role },
    tx
  );
  const destinations = accessible.filter((branch) => !isMainBranch(branch));
  const mainBranches = accessible.filter(isMainBranch);
  const branches = new Map(destinations.map((branch) => [branch.id, branch]));
  const namedBranches = new Map<string, string>();
  for (const branch of destinations)
    for (const label of [branch.code, branch.name])
      if (label && !namedBranches.has(branchKey(label)))
        namedBranches.set(branchKey(label), branch.id);
  const customers = await tx.customer.findMany({
    where: {
      branchId: { in: [...new Set([draft.branchId, ...branches.keys()])] },
      OR: [
        { deletedAt: null },
        {
          importAccounts: {
            some: { accountCode: { in: parsed.map((row) => row.accountCode).filter(Boolean) } },
          },
        },
      ],
    },
    include: { importAccounts: true },
  });
  type Found = (typeof customers)[number];
  // Main-branch customers are only compared, so the owner sees a debt already kept there.
  const mainCustomers = mainBranches.length
    ? await tx.customer.findMany({
        where: { branchId: { in: mainBranches.map((branch) => branch.id) }, deletedAt: null },
        include: { importAccounts: true },
      })
    : [];
  const mainBalances = await loadCustomerBalances(
    mainCustomers.map((customer) => customer.id),
    tx
  );
  const mainKeys = mainCustomers.map((customer) => ({
    customer,
    name: nameKey(customer.name),
    phone: normalizePhoneTerm(customer.phone),
  }));
  const mainMatchesFor = (row: { name: string; phoneKey: string; accountCode: string }) => {
    const key = nameKey(row.name);
    return mainKeys.flatMap(({ customer, name, phone }) => {
      const matchedBy =
        row.accountCode &&
        (customer.importAccounts ?? []).some((account) => account.accountCode === row.accountCode)
          ? ('ACCOUNT' as const)
          : row.phoneKey && phone === row.phoneKey
            ? ('PHONE' as const)
            : key && name === key
              ? ('NAME' as const)
              : similarName(key, name)
                ? ('SIMILAR_NAME' as const)
                : null;
      if (!matchedBy) return [];
      const owed = sumMoney(
        (mainBalances.get(customer.id)?.obligations ?? [])
          .filter((item) => item.currency === 'USD')
          .map((item) => item.remaining)
      );
      // Only an open debt there can be counted twice; a settled look-alike is noise.
      if (!owed.greaterThan(0)) return [];
      return [
        {
          id: customer.id,
          name: customer.name,
          phone: customer.phone,
          branchName: mainBranches.find((branch) => branch.id === customer.branchId)?.name ?? '',
          matchedBy,
          balanceUsd: moneyToApiString(owed),
        },
      ];
    });
  };
  const activeByBranch = new Map<string, Array<{ customer: Found; key: string }>>();
  const push = (index: Map<string, Found[]>, key: string, customer: Found) => {
    if (key) index.set(key, [...(index.get(key) ?? []), customer]);
  };
  const byAccount = new Map<string, Found[]>();
  const byPhone = new Map<string, Found[]>();
  const byName = new Map<string, Found[]>();
  const byNameAnywhere = new Map<string, Found[]>();
  for (const customer of customers) {
    for (const account of customer.importAccounts ?? [])
      push(byAccount, account.accountCode, customer);
    if (!customer.deletedAt) {
      activeByBranch.set(customer.branchId, [
        ...(activeByBranch.get(customer.branchId) ?? []),
        { customer, key: nameKey(customer.name) },
      ]);
      push(byPhone, normalizePhoneTerm(customer.phone), customer);
      push(byNameAnywhere, normalizeSearchTerm(customer.name).trim(), customer);
    }
    push(byName, customer.branchId + normalizeSearchTerm(customer.name).trim(), customer);
  }
  const previousImports = new Map<
    string,
    { id: string; fileName: string; committedAt: Date | null }
  >();
  for (const previous of await tx.customerImport.findMany({
    where: { fileHash: draft.fileHash, status: 'COMMITTED', id: { not: draft.id } },
    select: { id: true, fileName: true, committedAt: true, branchId: true },
    orderBy: { committedAt: 'desc' },
  }))
    if (!previousImports.has(previous.branchId)) previousImports.set(previous.branchId, previous);

  // A name identifies the customer unless the file or the record shows otherwise:
  // a different phone, or an account number of its own, means a different person.
  const sameName = (row: { name: string; phoneKey: string; accountCode: string }) =>
    (byNameAnywhere.get(normalizeSearchTerm(row.name).trim()) ?? []).filter((customer) => {
      const phone = normalizePhoneTerm(customer.phone);
      return (
        (!row.phoneKey || !phone || phone === row.phoneKey) &&
        (!row.accountCode || !(customer.importAccounts ?? []).length)
      );
    });
  const existingFor = (row: (typeof parsed)[number]) => {
    const accountHits = (row.accountCode && byAccount.get(row.accountCode)) || [];
    const phoneHits = (row.phoneKey && byPhone.get(row.phoneKey)) || [];
    return accountHits.length ? accountHits : phoneHits.length ? phoneHits : sameName(row);
  };
  const known = parsed.map(existingFor);
  // The file's known customers all live in other branches: the import's own branch is a
  // staging place, not a home. A new account then needs a real branch, chosen per row,
  // instead of being parked there and moved later.
  const stagingDestination =
    branches.size > 1 &&
    known.some((found) => found.length > 0) &&
    !known.some((found) => found.some((customer) => customer.branchId === draft.branchId));
  const placed = parsed.map((row, index) => {
    const chosen = document.rowBranches?.[row.rowNumber];
    const named = row.branchValue ? namedBranches.get(branchKey(row.branchValue)) : undefined;
    if (chosen && !branches.has(chosen)) row.issues.push('The selected branch is not available');
    if (row.branchValue && !named && !chosen)
      row.issues.push('Branch "' + row.branchValue + '" was not found');
    const existing = known[index];
    const homes = [...new Set(existing.map((customer) => customer.branchId))];
    const home =
      homes.length === 1
        ? homes[0]
        : homes.includes(draft.branchId) || !homes.length
          ? draft.branchId
          : null;
    // A Branch column places new customers only; known customers stay in their own branch.
    const newAccount = stagingDestination && !existing.length && !named && !chosen;
    const decided = newAccount ? null : (chosen ?? (existing.length ? home : (named ?? home)));
    const elsewhere = Boolean(chosen && homes.length && !homes.includes(chosen));
    const toMove =
      elsewhere && existing.length === 1 && !existing[0].deletedAt ? existing[0] : null;
    return {
      ...row,
      branchId: decided ?? draft.branchId,
      ambiguous: !decided || (elsewhere && !toMove),
      newAccount,
      chosenBranch: Boolean(chosen),
      toMove,
      existingBranches: homes,
    };
  });
  const counts = new Map<string, number>();
  const accountCounts = new Map<string, number>();
  for (const row of placed) {
    if (row.phoneKey)
      counts.set(row.branchId + row.phoneKey, (counts.get(row.branchId + row.phoneKey) ?? 0) + 1);
    if (row.accountCode)
      accountCounts.set(
        row.branchId + row.accountCode,
        (accountCounts.get(row.branchId + row.accountCode) ?? 0) + 1
      );
  }
  const matched = placed.map((row) => {
    const inBranch = (found?: Found[]) =>
      (found ?? []).filter((customer) => customer.branchId === row.branchId);
    const accountMatches = row.accountCode ? inBranch(byAccount.get(row.accountCode)) : [];
    if (accountMatches.some((customer) => customer.deletedAt))
      row.issues.push(
        'Account number belongs to an archived customer; restore that customer before importing'
      );
    const phoneMatches = row.phoneKey ? inBranch(byPhone.get(row.phoneKey)) : [];
    const nameMatches = accountMatches.length || phoneMatches.length ? [] : inBranch(sameName(row));
    const matchedBy = accountMatches.length
      ? ('ACCOUNT' as const)
      : phoneMatches.length
        ? ('PHONE' as const)
        : nameMatches.length
          ? ('NAME' as const)
          : row.toMove
            ? ('MOVE' as const)
            : null;
    // A known account cannot be rebound to a different phone-matched customer.
    const identityMismatch =
      accountMatches.length > 0 &&
      phoneMatches.some((customer) => !accountMatches.some((match) => match.id === customer.id));
    const matches = (
      identityMismatch
        ? [
            ...new Map(
              [...accountMatches, ...phoneMatches].map((customer) => [customer.id, customer])
            ).values(),
          ]
        : accountMatches.length
          ? accountMatches
          : phoneMatches.length
            ? phoneMatches
            : nameMatches.length
              ? nameMatches
              : row.toMove
                ? [row.toMove]
                : []
    ).map((customer) => ({
      id: customer.id,
      name: customer.name,
      phone: customer.phone,
      isActive: customer.isActive,
      accountCodes: (customer.importAccounts ?? []).map((account) => account.accountCode).sort(),
    }));
    return { row, matchedBy, identityMismatch, matches };
  });
  const balances = await loadCustomerBalances(
    matched.filter(({ matches }) => matches.length === 1).map(({ matches }) => matches[0].id),
    tx
  );
  const previousFileBalances = await loadPreviousFileBalances(
    draft.id,
    [...new Set([draft.branchId, ...branches.keys()])],
    tx
  );
  const supplied = new Map(
    ((draft.decisions ?? []) as unknown as CustomerImportDecision[]).map((decision) => [
      decision.rowNumber,
      decision,
    ])
  );
  const branchName = (id: string) => branches.get(id)?.name ?? '';
  const rows = matched.map(({ row, matchedBy, identityMismatch, matches }) => {
    const conflicts: Array<{ kind: string; message: string; blocking: boolean }> = [];
    if (row.ambiguous)
      conflicts.push({
        kind: 'BRANCH_AMBIGUOUS',
        message: row.newAccount
          ? 'New account: choose the branch this customer belongs to'
          : 'This customer exists in several branches; choose a branch where they already are, or skip',
        blocking: true,
      });
    if ((accountCounts.get(row.branchId + row.accountCode) ?? 0) > 1)
      conflicts.push({
        kind: 'FILE_ACCOUNT',
        message:
          'Account number occurs more than once in this file; select one row and skip the others',
        blocking: true,
      });
    if (identityMismatch)
      conflicts.push({
        kind: 'IDENTITY_MISMATCH',
        message:
          'Account number and phone identify different customers; skip this row and resolve the records manually',
        blocking: true,
      });
    if ((counts.get(row.branchId + row.phoneKey) ?? 0) > 1)
      conflicts.push({
        kind: 'FILE_PHONE',
        message: 'Phone occurs more than once in this file; select one row and skip the others',
        blocking: true,
      });
    if (matchedBy === 'MOVE')
      conflicts.push({
        kind: 'CUSTOMER_MOVE',
        message:
          'Will move from ' +
          branchName(row.toMove!.branchId) +
          ' with their debts, payments and history',
        blocking: false,
      });
    else if (matchedBy === 'NAME' && matches.length === 1 && row.accountCode)
      // The account number is the identity. A same-name customer with no account number
      // of their own is this account (typically a customer whose link was lost in a move):
      // relink them instead of asking, so the next import finds them by account again.
      conflicts.push({
        kind: 'ACCOUNT_RELINK',
        message:
          'Same name and no account number yet: account ' +
          row.accountCode +
          ' will be linked to this customer',
        blocking: false,
      });
    else if (matchedBy)
      conflicts.push({
        kind: 'EXISTING_' + matchedBy,
        message:
          matches.length === 1
            ? matchedBy === 'ACCOUNT'
              ? 'Account number already exists in this branch: update selected fields or skip'
              : matchedBy === 'PHONE'
                ? 'Phone already exists in this branch: update selected fields or skip'
                : 'A customer with this name is already in this branch: update them, add as new, or skip'
            : matchedBy === 'NAME'
              ? 'Several customers in this branch share this name; skip this row and update the right one by hand'
              : 'Multiple existing customers share this phone key; skip this row and resolve the duplicate manually',
        blocking: true,
      });
    for (const branchId of new Set(
      (byPhone.get(row.phoneKey) ?? [])
        .map((other) => other.branchId)
        .filter((id) => id !== row.branchId && id !== row.toMove?.branchId && branches.has(id))
    ))
      conflicts.push({
        kind: 'OTHER_BRANCH_PHONE',
        message: 'Also exists in branch: ' + branchName(branchId),
        blocking: false,
      });
    for (const branchId of new Set(
      (byAccount.get(row.accountCode) ?? [])
        .filter((other) => !other.deletedAt)
        .map((other) => other.branchId)
        .filter((id) => id !== row.branchId && id !== row.toMove?.branchId && branches.has(id))
    ))
      conflicts.push({
        kind: 'OTHER_BRANCH_ACCOUNT',
        message: 'Account number also exists in branch: ' + branchName(branchId),
        blocking: false,
      });
    if (
      (byName.get(row.branchId + normalizeSearchTerm(row.name).trim()) ?? []).some(
        (customer) => !matches.some((match) => match.id === customer.id)
      )
    )
      conflicts.push({
        kind: 'NAME_SIMILAR',
        message: 'Similar name on another customer in this branch',
        blocking: false,
      });
    const rowKey = nameKey(row.name);
    for (const { customer } of (activeByBranch.get(row.branchId) ?? []).filter(
      ({ customer, key }) =>
        similarName(rowKey, key) && !matches.some((match) => match.id === customer.id)
    ))
      conflicts.push({
        kind: 'NAME_ONE_LETTER',
        message:
          'One letter from "' +
          customer.name +
          '" in this branch; check it is not the same customer',
        blocking: false,
      });
    const mainMatches = mainMatchesFor(row);
    for (const match of mainMatches)
      conflicts.push({
        kind: 'MAIN_BRANCH_MATCH',
        message:
          (match.matchedBy === 'SIMILAR_NAME' ? 'Similar name in ' : 'Also in ') +
          (match.branchName || 'the main branch') +
          ' (read only): "' +
          match.name +
          '" owes $' +
          match.balanceUsd,
        blocking: false,
      });
    const state = matches.length === 1 ? balances.get(matches[0].id) : undefined;
    const balance = classifyBalance(
      matches.length > 1 ? { ...row, hasBalance: false } : row,
      state
    );
    // The old system keeps one net balance per account: a credit it no longer shows was
    // used against purchases there, so the held deposit is used up here too.
    if (balance.deposit.kind === 'LOWER')
      conflicts.push({
        kind: 'DEPOSIT_USED',
        message:
          'Deposit ' +
          balance.deposit.current +
          ' held here is now ' +
          balance.deposit.file +
          ' in the old system; it will be marked as used',
        blocking: false,
      });
    if (balance.kind === 'CURRENCY_MISMATCH')
      conflicts.push({
        kind: 'BALANCE_CURRENCY',
        message:
          'This customer has open balances in another currency; the balance will not be changed',
        blocking: false,
      });
    // The old system is the book of record for imported branches: its balance always wins.
    // A difference HomeConnect made on its own (a payment or sale not yet typed into the
    // old system) is undone here and named, so it can be entered there.
    const previousFile = row.accountCode
      ? previousFileFor(previousFileBalances, [row.branchId, draft.branchId], row.accountCode)
      : undefined;
    const homeConnectOnly =
      matches.length === 1 &&
      (MONEY_CHANGES as readonly string[]).includes(balance.kind) &&
      (sameFileBalance(previousFile, row) || Boolean(state?.activitySinceLastImport));
    if (homeConnectOnly)
      conflicts.push({
        kind: 'OLD_SYSTEM_WINS',
        message:
          (sameFileBalance(previousFile, row)
            ? 'No change in the old system since ' +
              previousFile!.fileName +
              ' (' +
              shortDate(previousFile!.committedAt) +
              '), but HomeConnect shows ' +
              balance.current
            : 'HomeConnect activity since the last import; HomeConnect shows ' + balance.current) +
          '. The old system wins: set to ' +
          balance.file +
          '. Enter any payment taken here in the old system too.',
        blocking: false,
      });
    // Re-uploading a file already imported: rows that already agree stay untouched.
    const alreadyImported =
      previousImports.has(row.branchId) &&
      matches.length === 1 &&
      matchedBy !== 'NAME' &&
      balance.kind === 'NONE' &&
      balance.deposit.kind === 'NONE';
    const defaultDecision: CustomerImportDecision =
      row.issues.length || row.ambiguous || matches.length > 1 || alreadyImported
        ? { rowNumber: row.rowNumber, action: 'SKIP' }
        : matches.length === 1
          ? {
              rowNumber: row.rowNumber,
              action: 'UPDATE',
              targetCustomerId: matches[0].id,
              // A name match keeps the existing spelling; the file only confirmed who this is.
              updateFields: (['name', 'address', 'notes', 'creditLimit'] as const).filter(
                (field) =>
                  mapping[field] != null &&
                  row[field] !== undefined &&
                  !(field === 'name' && matchedBy === 'NAME')
              ),
            }
          : { rowNumber: row.rowNumber, action: 'CREATE' };
    const fingerprint = JSON.stringify([
      row.branchId,
      row.toMove?.branchId ?? null,
      matches.map((match) => [match.id, match.isActive, match.accountCodes]).sort(),
      (state?.obligations ?? []).map((item) => [item.id, item.remaining.toFixed(2)]),
      Boolean(state?.activitySinceLastImport),
      (state?.deposits ?? []).map((item) => [item.id, item.held.toFixed(2)]),
    ]);
    const {
      ambiguous: _ambiguous,
      newAccount: _newAccount,
      toMove: _toMove,
      existingBranches,
      ...fields
    } = row;
    return {
      ...fields,
      branchName: branchName(row.branchId),
      matchedBy,
      moveFrom: row.toMove
        ? { branchId: row.toMove.branchId, branchName: branchName(row.toMove.branchId) }
        : null,
      existingBranches: existingBranches.map((id) => ({ id, name: branchName(id) })),
      matches,
      mainMatches,
      conflicts,
      balance,
      status: row.issues.length
        ? ('INVALID' as const)
        : conflicts.some((conflict) => conflict.blocking)
          ? ('CONFLICT' as const)
          : ('READY' as const),
      decision: supplied.get(row.rowNumber) ?? defaultDecision,
      fingerprint,
    };
  });
  const missing = await findMissingCustomers({
    document,
    rows,
    previousFileBalances,
    branchName,
    draftBranchId: draft.branchId,
    tx,
  });
  const summary = {
    total: rows.length,
    ready: rows.filter((row) => row.status === 'READY').length,
    conflicts: rows.filter((row) => row.status === 'CONFLICT').length,
    invalid: rows.filter((row) => row.status === 'INVALID').length,
  };
  const zero = () => new Prisma.Decimal(0);
  const totals = {
    NEW: { count: 0, usd: zero() },
    INCREASE: { count: 0, usd: zero() },
    DECREASE: { count: 0, usd: zero() },
    DEPOSIT: { count: 0, usd: zero() },
    DEPOSIT_USED: { count: 0, usd: zero() },
  };
  const rates = new Map<'USD' | 'LBP', Prisma.Decimal>();
  const rateFor = async (currency: 'USD' | 'LBP') => {
    const rate =
      rates.get(currency) ?? (await ExchangeRatesService.snapshotFor(currency, new Date(), tx));
    rates.set(currency, rate);
    return rate;
  };
  const usd = async (amount: string, currency: 'USD' | 'LBP') => {
    let value: Prisma.Decimal;
    try {
      value = parseMoney(amount, currency).abs();
    } catch {
      return zero();
    }
    return toBaseAmount(value, currency, await rateFor(currency), Prisma.Decimal.ROUND_HALF_UP);
  };
  // One reconciliation line per destination branch, like an ERP posting summary.
  const perBranch = new Map<
    string,
    {
      branchId: string;
      branchName: string;
      rows: number;
      created: number;
      updated: number;
      skipped: number;
      invalid: number;
      conflicts: number;
      fileDebt: Prisma.Decimal;
      fileDeposit: Prisma.Decimal;
      newDebt: Prisma.Decimal;
      increase: Prisma.Decimal;
      payment: Prisma.Decimal;
      /** Part of payment: customers no longer in the file, settled to zero. */
      settled: Prisma.Decimal;
      deposit: Prisma.Decimal;
      /** Imported deposits this import marks as used. */
      depositUsed: Prisma.Decimal;
    }
  >();
  for (const row of rows) {
    const line = perBranch.get(row.branchId) ?? {
      branchId: row.branchId,
      branchName: row.branchName,
      rows: 0,
      created: 0,
      updated: 0,
      skipped: 0,
      invalid: 0,
      conflicts: 0,
      fileDebt: zero(),
      fileDeposit: zero(),
      newDebt: zero(),
      increase: zero(),
      payment: zero(),
      settled: zero(),
      deposit: zero(),
      depositUsed: zero(),
    };
    perBranch.set(row.branchId, line);
    line.rows++;
    if (row.status === 'INVALID') line.invalid++;
    if (row.status === 'CONFLICT') line.conflicts++;
    // What the file says covers every valid row, skipped or not, so it can be compared
    // with what the branch owes after the import.
    if (row.status !== 'INVALID' && row.balance.kind !== 'NO_INFO') {
      line.fileDebt = line.fileDebt.plus(await usd(row.openingBalance, row.currency));
      line.fileDeposit = line.fileDeposit.plus(await usd(row.deposit, row.currency));
    }
    if (row.decision.action === 'SKIP') {
      line.skipped++;
      continue;
    }
    if (row.decision.action === 'CREATE') line.created++;
    else line.updated++;
    if (changesDebt(row)) {
      const amount = await usd(row.balance.difference, row.currency);
      const total = totals[row.balance.kind as 'NEW' | 'INCREASE' | 'DECREASE'];
      total.count++;
      total.usd = total.usd.plus(amount);
      if (row.balance.kind === 'NEW') line.newDebt = line.newDebt.plus(amount);
      else if (row.balance.kind === 'INCREASE') line.increase = line.increase.plus(amount);
      else line.payment = line.payment.plus(amount);
    }
    if (addsDeposit(row)) {
      const amount = await usd(row.balance.deposit.difference, row.currency);
      totals.DEPOSIT.count++;
      totals.DEPOSIT.usd = totals.DEPOSIT.usd.plus(amount);
      line.deposit = line.deposit.plus(amount);
    }
    if (usesDeposit(row)) {
      totals.DEPOSIT_USED.count++;
      const used = await usd(row.balance.deposit.current, row.currency);
      totals.DEPOSIT_USED.usd = totals.DEPOSIT_USED.usd.plus(used);
      line.depositUsed = line.depositUsed.plus(used);
      const kept = await usd(row.balance.deposit.file, row.currency);
      if (kept.greaterThan(0)) {
        totals.DEPOSIT.count++;
        totals.DEPOSIT.usd = totals.DEPOSIT.usd.plus(kept);
        line.deposit = line.deposit.plus(kept);
      }
    }
  }
  const settleTotal = { count: 0, usd: zero() };
  for (const item of missing) {
    if (item.decision !== 'SETTLE') continue;
    let amount = zero();
    for (const owed of item.owed) amount = amount.plus(await usd(owed.amount, owed.currency));
    settleTotal.count++;
    settleTotal.usd = settleTotal.usd.plus(amount);
    const line = perBranch.get(item.branchId);
    if (line) {
      line.payment = line.payment.plus(amount);
      line.settled = line.settled.plus(amount);
    }
  }
  // What each branch's customers owe in HomeConnect now, on the same basis as the balances above.
  const branchCustomers = perBranch.size
    ? await tx.customer.findMany({
        where: { branchId: { in: [...perBranch.keys()] }, deletedAt: null },
        select: { id: true, branchId: true },
      })
    : [];
  const branchBalances = await loadCustomerBalances(
    branchCustomers.map((customer) => customer.id),
    tx
  );
  const openBefore = new Map<string, Prisma.Decimal>();
  // Credit the shop holds for customers: the old system subtracts it in its balance.
  const heldBefore = new Map<string, Prisma.Decimal>();
  for (const customer of branchCustomers)
    for (const item of branchBalances.get(customer.id)?.deposits ?? [])
      heldBefore.set(
        customer.branchId,
        (heldBefore.get(customer.branchId) ?? zero()).plus(
          toBaseAmount(
            item.held,
            item.currency,
            await rateFor(item.currency),
            Prisma.Decimal.ROUND_HALF_UP
          )
        )
      );
  for (const customer of branchCustomers)
    for (const item of branchBalances.get(customer.id)?.obligations ?? [])
      openBefore.set(
        customer.branchId,
        (openBefore.get(customer.branchId) ?? zero()).plus(
          toBaseAmount(
            item.remaining,
            item.currency,
            await rateFor(item.currency),
            Prisma.Decimal.ROUND_HALF_UP
          )
        )
      );
  const branchTotals = [...perBranch.values()]
    .sort((left, right) => left.branchName.localeCompare(right.branchName))
    .map((line) => {
      const before = openBefore.get(line.branchId) ?? zero();
      const net = line.newDebt.plus(line.increase).minus(line.payment);
      const heldAfter = (heldBefore.get(line.branchId) ?? zero())
        .plus(line.deposit)
        .minus(line.depositUsed);
      return {
        branchId: line.branchId,
        branchName: line.branchName,
        rows: line.rows,
        created: line.created,
        updated: line.updated,
        skipped: line.skipped,
        invalid: line.invalid,
        conflicts: line.conflicts,
        fileDebtUsd: line.fileDebt.toFixed(2),
        fileDepositUsd: line.fileDeposit.toFixed(2),
        newDebtUsd: line.newDebt.toFixed(2),
        increaseUsd: line.increase.toFixed(2),
        paymentUsd: line.payment.toFixed(2),
        settledMissingUsd: line.settled.toFixed(2),
        depositUsd: line.deposit.toFixed(2),
        netDebtChangeUsd: net.toFixed(2),
        openBeforeUsd: before.toFixed(2),
        openAfterUsd: before.plus(net).toFixed(2),
        depositsHeldAfterUsd: heldAfter.toFixed(2),
        /** The old system's figure: debit minus credit balances in the file. */
        fileBalanceUsd: line.fileDebt.minus(line.fileDeposit).toFixed(2),
        /** The same figure in HomeConnect after the import: owed minus deposits held. */
        balanceAfterUsd: before.plus(net).minus(heldAfter).toFixed(2),
      };
    });
  const planned = {
    created: rows.filter((row) => row.decision.action === 'CREATE').length,
    updated: rows.filter((row) => row.decision.action === 'UPDATE').length,
    skipped: rows.filter((row) => row.decision.action === 'SKIP').length,
    moved: rows.filter((row) => row.decision.action === 'UPDATE' && row.moveFrom).length,
    openingDebts: totals.NEW.count,
    openingDebtTotalUsd: totals.NEW.usd.toFixed(2),
    balanceIncreases: totals.INCREASE.count,
    balanceIncreaseTotalUsd: totals.INCREASE.usd.toFixed(2),
    balancePayments: totals.DECREASE.count,
    balancePaymentTotalUsd: totals.DECREASE.usd.toFixed(2),
    deposits: totals.DEPOSIT.count,
    depositTotalUsd: totals.DEPOSIT.usd.toFixed(2),
    depositsUsed: totals.DEPOSIT_USED.count,
    depositUsedTotalUsd: totals.DEPOSIT_USED.usd.toFixed(2),
    settledMissing: settleTotal.count,
    settledMissingTotalUsd: settleTotal.usd.toFixed(2),
    branchTotals,
    dueDateRequired: rows.some((row) => addsDebt(row) && !row.dueDate),
  };
  return {
    planned,
    id: draft.id,
    branchId: draft.branchId,
    fileName: draft.fileName,
    status: draft.status,
    headers: document.headers,
    format: document.format,
    columnMapping: mapping,
    branches: destinations.map((branch) => ({
      id: branch.id,
      code: branch.code,
      name: branch.name,
    })),
    rows,
    missing,
    summary,
    previousCommittedImport:
      previousImports.get(draft.branchId) ??
      rows.map((row) => previousImports.get(row.branchId)).find(Boolean) ??
      null,
    result: draft.result,
  };
}
type Preview = Awaited<ReturnType<typeof buildCustomerImportPreview>>;
function validateDecisions(
  preview: Preview,
  decisions: CustomerImportDecision[],
  missing: Array<{ customerId: string }> = []
) {
  const rowNumbers = new Set(preview.rows.map((row) => row.rowNumber));
  if (decisions.some((decision) => !rowNumbers.has(decision.rowNumber)))
    throw new ValidationError('Decision refers to a row outside this import');
  const listed = new Set(preview.missing.map((item) => item.customerId));
  if (missing.some((item) => !listed.has(item.customerId)))
    throw stale('A customer missing from the file is no longer listed.');
}
async function saveSnapshot(draft: Draft, tx: Client) {
  const preview = await buildCustomerImportPreview(draft, tx);
  const document = draft.rows as unknown as CsvDocument;
  await tx.customerImport.update({
    where: { id: draft.id, branchId: draft.branchId },
    data: {
      decisions: json(preview.rows.map((row) => row.decision)),
      rows: json({
        ...document,
        snapshot: Object.fromEntries(preview.rows.map((row) => [row.rowNumber, row.fingerprint])),
        missingDecisions: Object.fromEntries(
          preview.missing.map((item) => [item.customerId, item.decision])
        ),
        missingSnapshot: Object.fromEntries(
          preview.missing.map((item) => [item.customerId, item.fingerprint])
        ),
      }),
    },
  });
  return preview;
}
export class CustomerImportService {
  static async authorizeDestination(
    actor: BranchActor,
    destination: { branchId: string } | { importId: string }
  ) {
    return runFinancialTransaction(async (tx) => {
      const branch =
        'importId' in destination
          ? (await findDraft(destination.importId, actor, tx)).branch
          : await checkedBranch(destination.branchId, actor, tx);
      return { mode: 'single' as const, branchIds: [branch.id] };
    });
  }
  static async createDraft(input: CreateCustomerImportInput, actor: BranchActor) {
    const values = createCustomerImportSchema.parse(input);
    const document = parseCustomerCsv(values.csvText);
    return runFinancialTransaction(async (tx) => {
      const branch = await checkedBranch(values.branchId, actor, tx);
      assertImportDestination(branch);
      const draft = await tx.customerImport.create({
        data: {
          branchId: branch.id,
          fileName: values.fileName,
          fileHash: importFileHash(values.csvText),
          columnMapping: json(detectColumnMapping(document.headers)),
          rows: json(document),
          createdById: actor.userId,
        },
      });
      return { ...(await saveSnapshot(draft, tx)), branch };
    });
  }
  static async getDraft(id: string, actor: BranchActor) {
    return runFinancialTransaction(async (tx) => {
      const { draft, branch } = await findDraft(id, actor, tx);
      return { ...(await buildCustomerImportPreview(draft, tx)), branch };
    });
  }
  static async updateDraft(id: string, input: UpdateCustomerImportInput, actor: BranchActor) {
    const values = updateCustomerImportSchema.parse(input);
    return runFinancialTransaction(async (tx) => {
      const { draft: existing, branch } = await findDraft(id, actor, tx);
      assertDraft(existing);
      const document = existing.rows as unknown as CsvDocument;
      for (const branchId of new Set(values.rowBranches?.map((item) => item.branchId)))
        if (branchId) assertImportDestination(await checkedBranch(branchId, actor, tx));
      if (
        values.rowBranches?.some(
          (item) => item.rowNumber < 2 || item.rowNumber > document.records.length + 1
        )
      )
        throw new ValidationError('Branch choice refers to a row outside this import');
      // A decision made for one branch can name a customer that only exists there.
      const moved = new Set(values.rowBranches?.map((item) => item.rowNumber));
      const decisions = (
        values.decisions ?? ((existing.decisions ?? []) as unknown as CustomerImportDecision[])
      ).filter((decision) => !moved.has(decision.rowNumber));
      const missingDecisions = values.missing
        ? {
            ...document.missingDecisions,
            ...Object.fromEntries(values.missing.map((item) => [item.customerId, item.action])),
          }
        : document.missingDecisions;
      const draft = await tx.customerImport.update({
        where: { id, branchId: existing.branchId },
        data: {
          ...(values.columnMapping
            ? {
                columnMapping: json(values.columnMapping),
                decisions: Prisma.DbNull,
                // Refreshing with the same mapping keeps the branches already chosen.
                ...(JSON.stringify(values.columnMapping) === JSON.stringify(existing.columnMapping)
                  ? {}
                  : { rows: json({ ...document, rowBranches: undefined }) }),
              }
            : {}),
          ...(values.decisions || values.rowBranches ? { decisions: json(decisions) } : {}),
          ...(values.missing && !values.rowBranches
            ? { rows: json({ ...document, missingDecisions }) }
            : {}),
          ...(values.rowBranches
            ? {
                rows: json({
                  ...document,
                  missingDecisions,
                  // JSON drops the undefined entries, returning those rows to their own branch.
                  rowBranches: {
                    ...document.rowBranches,
                    ...Object.fromEntries(
                      values.rowBranches.map((item) => [item.rowNumber, item.branchId ?? undefined])
                    ),
                  },
                }),
              }
            : {}),
        },
      });
      const preview = await saveSnapshot(draft, tx);
      validateDecisions(preview, values.decisions ?? [], values.missing ?? []);
      return { ...preview, branch };
    });
  }
  static async commit(
    id: string,
    input: CommitCustomerImportInput,
    actor: BranchActor,
    context: ImportContext = {}
  ) {
    const values = commitCustomerImportSchema.parse(input);
    return runFinancialTransaction(
      async (tx) => {
        const { draft } = await findDraft(id, actor, tx);
        if (draft.status === 'COMMITTED') return draft.result;
        const preview = await buildCustomerImportPreview(draft, tx);
        validateDecisions(preview, values.decisions, values.missing ?? []);
        const supplied = new Map(
          values.decisions.map((decision) => [decision.rowNumber, decision])
        );
        const rows = preview.rows.map((row) => ({
          ...row,
          decision: supplied.get(row.rowNumber) ?? row.decision,
        }));
        const document = draft.rows as unknown as CsvDocument;
        const snapshot = document.snapshot ?? {};
        const chosenKeys = new Set<string>();
        const chosenPhones = new Set<string>();
        const chosenCustomers = new Set<string>();
        for (const row of rows) {
          const decision = row.decision;
          if (decision.action === 'SKIP') continue;
          if (row.issues.length)
            throw unresolved(
              'Invalid row ' + row.rowNumber + ' must be skipped or corrected in the source file'
            );
          if (row.conflicts.some((conflict) => conflict.kind === 'BRANCH_AMBIGUOUS'))
            throw unresolved('Choose a branch for row ' + row.rowNumber);
          if (snapshot[row.rowNumber] !== row.fingerprint)
            throw stale('Matching customers or balances changed for row ' + row.rowNumber + '.');
          const identity = row.branchId + row.identityKey;
          const phone = row.phoneKey && row.branchId + row.phoneKey;
          if (chosenKeys.has(identity) || (phone && chosenPhones.has(phone)))
            throw unresolved('Choose one row for each duplicate account or phone');
          chosenKeys.add(identity);
          if (phone) chosenPhones.add(phone);
          if (row.conflicts.some((conflict) => conflict.kind === 'IDENTITY_MISMATCH'))
            throw unresolved('Account number and phone identify different customers');
          if (decision.targetCustomerId) {
            if (chosenCustomers.has(decision.targetCustomerId))
              throw unresolved('Choose one row per matching customer');
            chosenCustomers.add(decision.targetCustomerId);
          }
          if (decision.action === 'CREATE' && row.matches.length && row.matchedBy !== 'NAME')
            throw unresolved('Existing account or phone must be updated or skipped');
          if (
            decision.action === 'UPDATE' &&
            (row.matches.length !== 1 || row.matches[0].id !== decision.targetCustomerId)
          )
            throw unresolved(
              'UPDATE must target the sole matching customer in the destination branch'
            );
        }
        const missingChoice = new Map(
          (values.missing ?? []).map((item) => [item.customerId, item.action])
        );
        const settling = preview.missing.filter(
          (item) => (missingChoice.get(item.customerId) ?? item.decision) === 'SETTLE'
        );
        for (const item of settling)
          if (document.missingSnapshot?.[item.customerId] !== item.fingerprint)
            throw stale('Balance changed for ' + item.name + ', who is not in the file.');
        const acting = rows.filter((row) => row.decision.action !== 'SKIP');
        // The destination check covers revocation and deactivation since the preview.
        for (const branchId of new Set([
          ...acting.map((row) => row.branchId),
          ...settling.map((item) => item.branchId),
        ]))
          assertImportDestination(await checkedBranch(branchId, actor, tx));
        if (rows.some((row) => addsDebt(row) && !row.dueDate) && !values.dueDate)
          throw new ValidationError('Choose a due date for the new debts');
        const defaultDueDate = values.dueDate ? parseBusinessDate(values.dueDate) : null;
        if (rows.some(changesMoney) || settling.length) {
          if (!values.accountPassword)
            throw new ValidationError('Account password is required for balance changes');
          await verifyAdminPassword(
            actor.userId,
            values.accountPassword,
            {
              action: 'COMMIT_CUSTOMER_CSV_IMPORT',
              recordType: 'CUSTOMER_IMPORT',
              recordId: id,
              ipAddress: context.ipAddress,
              domainLabel: 'customer balances',
            },
            tx
          );
        }
        // customer_import_accounts references (import id, branch id), so each extra
        // branch needs its own committed import record for this file.
        const importIds = new Map([[draft.branchId, id]]);
        const childImportIds: string[] = [];
        for (const branchId of new Set(acting.map((row) => row.branchId))) {
          if (importIds.has(branchId)) continue;
          const branchRows = rows.filter((row) => row.branchId === branchId);
          const child = await tx.customerImport.create({
            data: {
              branchId,
              fileName: draft.fileName,
              fileHash: draft.fileHash,
              status: 'COMMITTED',
              columnMapping: json(draft.columnMapping),
              rows: json({
                headers: document.headers,
                format: document.format,
                records: branchRows.map((row) => document.records[row.rowNumber - 2]),
              }),
              decisions: json(branchRows.map((row) => row.decision)),
              result: json({ parentImportId: id }),
              createdById: draft.createdById,
              committedById: actor.userId,
              committedAt: new Date(),
            },
          });
          importIds.set(branchId, child.id);
          childImportIds.push(child.id);
        }
        const balances = await loadCustomerBalances(
          rows
            .filter(
              (row) => (changesDebt(row) && row.balance.kind === 'DECREASE') || usesDeposit(row)
            )
            .map((row) => row.decision.targetCustomerId!),
          tx
        );
        const summary = {
          created: 0,
          updated: 0,
          skipped: 0,
          invalid: 0,
          moved: 0,
          openingDebts: 0,
          openingDebtTotalUsd: '0.00',
          balanceIncreases: 0,
          balanceIncreaseTotalUsd: '0.00',
          balancePayments: 0,
          balancePaymentTotalUsd: '0.00',
          deposits: 0,
          depositTotalUsd: '0.00',
          depositsUsed: 0,
          depositUsedTotalUsd: '0.00',
          settledMissing: 0,
          settledMissingTotalUsd: '0.00',
        };
        let depositTotal = new Prisma.Decimal(0);
        let depositUsedTotal = new Prisma.Decimal(0);
        let openingTotal = new Prisma.Decimal(0);
        let increaseTotal = new Prisma.Decimal(0);
        let paymentTotal = new Prisma.Decimal(0);
        const today = todayInBusinessTimezone();
        const reference = ('Import ' + draft.fileName).slice(0, 100);
        const report: string[][] = [['Row', ...preview.headers, 'Reason']];
        const reportRow = (row: (typeof rows)[number], reason: string) =>
          report.push([String(row.rowNumber), ...document.records[row.rowNumber - 2], reason]);
        for (const row of rows) {
          const decision = row.decision;
          if (decision.action === 'SKIP') {
            summary.skipped++;
            if (row.status === 'INVALID') summary.invalid++;
            reportRow(
              row,
              [...row.issues, ...row.conflicts.map((conflict) => conflict.message)].join('; ') ||
                'Skipped by user'
            );
            continue;
          }
          const importId = importIds.get(row.branchId)!;
          let customerId: string;
          if (decision.action === 'CREATE') {
            assertCreditLimitPermission(row, actor);
            const customer = await tx.customer.create({
              data: {
                branchId: row.branchId,
                name: row.name,
                phone: row.phone,
                address: row.address,
                notes: row.notes,
                creditLimit: row.creditLimit,
                isActive: row.isActive,
                createdBy: actor.userId,
              },
            });
            customerId = customer.id;
            summary.created++;
          } else {
            customerId = decision.targetCustomerId!;
            if (row.moveFrom) {
              // Moves before any other write so every record below lands in the new branch.
              await CustomerBranchTransferService.moveInTransaction(tx, {
                customerId,
                toBranchId: row.branchId,
                actor,
                ipAddress: context.ipAddress,
              });
              summary.moved++;
            }
            const data = Object.fromEntries(
              (decision.updateFields ?? [])
                .filter((field) => row[field] !== undefined)
                .map((field) => [field, row[field]])
            );
            assertCreditLimitPermission(data, actor);
            if (Object.keys(data).length)
              await tx.customer.update({
                where: { id: customerId, branchId: row.branchId, deletedAt: null },
                data,
              });
            summary.updated++;
          }
          if (row.accountCode) {
            const binding = await tx.customerImportAccount.findUnique({
              where: {
                branchId_accountCode: { branchId: row.branchId, accountCode: row.accountCode },
              },
            });
            if (binding && binding.customerId !== customerId)
              throw stale('Account number was assigned to another customer.');
            if (!binding)
              await tx.customerImportAccount.create({
                data: {
                  branchId: row.branchId,
                  accountCode: row.accountCode,
                  customerId,
                  sourceCustomerImportId: importId,
                  createdById: actor.userId,
                },
              });
          }
          await tx.activityLog.create({
            data: {
              branchId: row.branchId,
              userId: actor.userId,
              entityType: 'Customer',
              entityId: customerId,
              action: decision.action === 'CREATE' ? 'CUSTOMER_CREATED' : 'CUSTOMER_UPDATED',
              details: {
                customerImportId: id,
                rowNumber: row.rowNumber,
                accountCode: row.accountCode || null,
                updateFields: decision.updateFields ?? [],
              },
              ipAddress: context.ipAddress,
            },
          });
          if (!changesMoney(row)) continue;
          const exchangeRate = await ExchangeRatesService.snapshotFor(row.currency, new Date(), tx);
          const toBase = (value: Prisma.Decimal) =>
            toBaseAmount(value, row.currency, exchangeRate, Prisma.Decimal.ROUND_HALF_UP);
          const reasons: string[] = [];
          if (changesDebt(row)) {
            const amount = absoluteDifference(row);
            const baseAmount = toBase(amount);
            reasons.push(
              'Balance ' + row.balance.current + ' to ' + row.balance.file + ' ' + row.currency
            );
            if (row.balance.kind === 'DECREASE') {
              const scope = { mode: 'single' as const, branchIds: [row.branchId] };
              for (const payment of planBalancePayments(
                balances.get(customerId)?.obligations ?? [],
                amount,
                row.currency
              )) {
                const input = {
                  amount: moneyToApiString(payment.amount, row.currency),
                  currency: row.currency,
                  paymentDate: today,
                  paymentMethod: 'OTHER' as const,
                  reference,
                  idempotencyKey:
                    IMPORT_PAYMENT_KEY_PREFIX + id + ':' + row.rowNumber + ':' + payment.id,
                };
                if (payment.kind === 'DEBT')
                  await DebtsService.recordDebtPaymentInTransaction(
                    tx,
                    payment.id,
                    input,
                    actor,
                    scope
                  );
                else
                  await InstallmentPlansService.recordPlanPaymentInTransaction(
                    tx,
                    payment.id,
                    input,
                    actor,
                    scope
                  );
              }
              await tx.activityLog.create({
                data: {
                  branchId: row.branchId,
                  userId: actor.userId,
                  action: 'CUSTOMER_IMPORT_BALANCE_PAYMENT',
                  entityType: 'Customer',
                  entityId: customerId,
                  details: {
                    customerImportId: id,
                    rowNumber: row.rowNumber,
                    previousBalance: row.balance.current,
                    fileBalance: row.balance.file,
                    amount: amount.toString(),
                    currency: row.currency,
                  },
                  ipAddress: context.ipAddress,
                },
              });
              summary.balancePayments++;
              paymentTotal = paymentTotal.plus(baseAmount);
            } else {
              const isFirst = row.balance.kind === 'NEW';
              const dueDate = row.dueDate ?? defaultDueDate!;
              const debt = await DebtsRepository.createDebt(
                {
                  customerId,
                  description:
                    (isFirst ? 'Opening balance' : 'Balance increase') +
                    ' — import ' +
                    draft.fileName,
                  kind: 'STANDARD',
                  originalAmount: amount,
                  currency: row.currency,
                  exchangeRate,
                  baseOriginalAmount: baseAmount,
                  dueDate: businessDateToPrisma(dueDate),
                  status: determineDebtStatus({
                    isCancelled: false,
                    dueDate,
                    businessDate: today,
                    balance: calculateDebtBalance({ originalAmount: amount }),
                    overdueEligible: true,
                  }),
                  createdById: actor.userId,
                  sourceCustomerImportId: importId,
                },
                tx
              );
              await tx.activityLog.create({
                data: {
                  branchId: debt.branchId,
                  userId: actor.userId,
                  action: 'DEBT_CREATED',
                  entityType: 'Debt',
                  entityId: debt.id,
                  details: {
                    customerId,
                    customerImportId: id,
                    rowNumber: row.rowNumber,
                    originalAmount: amount.toString(),
                    currency: row.currency,
                    exchangeRate: exchangeRate.toString(),
                    baseOriginalAmount: baseAmount.toFixed(2),
                  },
                  ipAddress: context.ipAddress,
                },
              });
              if (isFirst) {
                summary.openingDebts++;
                openingTotal = openingTotal.plus(baseAmount);
              } else {
                summary.balanceIncreases++;
                increaseTotal = increaseTotal.plus(baseAmount);
              }
            }
          }
          if (usesDeposit(row)) {
            const used = (balances.get(customerId)?.deposits ?? []).filter(
              (held) => held.currency === row.currency
            );
            for (const held of used) {
              const prepaid = await tx.prepaidPurchase.findUnique({
                where: { debtId: held.id },
                select: { id: true, status: true },
              });
              if (!prepaid || prepaid.status !== 'PENDING')
                throw stale('A deposit changed for row ' + row.rowNumber + '.');
              await PrepaidRepository.markDelivered(tx, prepaid.id, {
                deliveredAt: businessDateToPrisma(today),
                deliveredById: actor.userId,
                deliveryNotes: (
                  'Used in the previous system (import ' +
                  draft.fileName +
                  ')'
                ).slice(0, 1000),
                remainderDebtId: null,
              });
              await tx.activityLog.create({
                data: {
                  branchId: row.branchId,
                  userId: actor.userId,
                  action: 'CUSTOMER_IMPORT_DEPOSIT_USED',
                  entityType: 'Customer',
                  entityId: customerId,
                  details: {
                    customerImportId: id,
                    rowNumber: row.rowNumber,
                    depositDebtId: held.id,
                    amount: held.held.toString(),
                    currency: row.currency,
                  },
                  ipAddress: context.ipAddress,
                },
              });
              depositUsedTotal = depositUsedTotal.plus(toBase(held.held));
            }
            summary.depositsUsed++;
            reasons.push(
              'Deposit ' +
                row.balance.deposit.current +
                ' to ' +
                row.balance.deposit.file +
                ' ' +
                row.currency
            );
          }
          // After using the old deposits, what the file still shows as credit is held anew.
          const depositToHold = addsDeposit(row)
            ? row.balance.deposit.difference
            : usesDeposit(row)
              ? row.balance.deposit.file
              : '0';
          if (parseMoney(depositToHold, row.currency).greaterThan(0)) {
            const amount = parseMoney(depositToHold, row.currency);
            const baseAmount = toBase(amount);
            const note = (
              'Deposit carried over from the previous system (import ' +
              draft.fileName +
              ')'
            ).slice(0, 1000);
            const deposit = await DebtsRepository.createDebt(
              {
                customerId,
                description: 'Opening deposit — import ' + draft.fileName,
                kind: 'PREPAID_PURCHASE',
                originalAmount: amount,
                currency: row.currency,
                exchangeRate,
                baseOriginalAmount: baseAmount,
                dueDate: businessDateToPrisma(today),
                status: 'UNPAID',
                notes: note,
                createdById: actor.userId,
                sourceCustomerImportId: importId,
              },
              tx
            );
            await PrepaidRepository.createForDebt(tx, { debtId: deposit.id });
            // Real money the customer handed over: a cash payment, held as a deposit.
            const payment = await DebtsRepository.createPayment(tx, {
              customerId,
              totalAmount: amount,
              currency: row.currency,
              exchangeRate,
              baseAmount,
              paymentDate: businessDateToPrisma(today),
              paymentMethod: 'CASH',
              reference,
              notes: note,
              idempotencyKey: IMPORT_PAYMENT_KEY_PREFIX + id + ':' + row.rowNumber + ':deposit',
              createdById: actor.userId,
            });
            await DebtsRepository.createDebtPaymentAllocation(tx, {
              paymentId: payment.id,
              debtId: deposit.id,
              amount,
            });
            await DebtsRepository.updateDebtStatus(
              tx,
              deposit.id,
              determineDebtStatus({
                isCancelled: false,
                dueDate: today,
                businessDate: today,
                balance: calculateDebtBalance({
                  originalAmount: amount,
                  allocations: [{ amount, isVoided: false }],
                }),
                overdueEligible: false,
              })
            );
            await tx.activityLog.create({
              data: {
                branchId: deposit.branchId,
                userId: actor.userId,
                action: 'CUSTOMER_IMPORT_DEPOSIT',
                entityType: 'Debt',
                entityId: deposit.id,
                details: {
                  customerId,
                  customerImportId: id,
                  rowNumber: row.rowNumber,
                  previousDeposit: row.balance.deposit.current,
                  fileDeposit: row.balance.deposit.file,
                  amount: amount.toString(),
                  currency: row.currency,
                  paymentId: payment.id,
                },
                ipAddress: context.ipAddress,
              },
            });
            summary.deposits++;
            depositTotal = depositTotal.plus(baseAmount);
            if (addsDeposit(row))
              reasons.push('Deposit ' + row.balance.deposit.difference + ' ' + row.currency);
          }
          reportRow(row, reasons.join('; ') + ' in ' + row.branchName);
        }
        // Customers the trial balance no longer lists paid in full in the old system.
        const settledBalances = await loadCustomerBalances(
          settling.map((item) => item.customerId),
          tx
        );
        let settledTotal = new Prisma.Decimal(0);
        for (const item of settling) {
          const scope = { mode: 'single' as const, branchIds: [item.branchId] };
          const paid: string[] = [];
          for (const obligation of settledBalances.get(item.customerId)?.obligations ?? []) {
            const rate = await ExchangeRatesService.snapshotFor(
              obligation.currency,
              new Date(),
              tx
            );
            const input = {
              amount: moneyToApiString(obligation.remaining, obligation.currency),
              currency: obligation.currency,
              paymentDate: today,
              paymentMethod: 'OTHER' as const,
              reference,
              idempotencyKey: IMPORT_PAYMENT_KEY_PREFIX + id + ':m:' + obligation.id,
            };
            if (obligation.kind === 'DEBT')
              await DebtsService.recordDebtPaymentInTransaction(
                tx,
                obligation.id,
                input,
                actor,
                scope
              );
            else
              await InstallmentPlansService.recordPlanPaymentInTransaction(
                tx,
                obligation.id,
                input,
                actor,
                scope
              );
            settledTotal = settledTotal.plus(
              toBaseAmount(
                obligation.remaining,
                obligation.currency,
                rate,
                Prisma.Decimal.ROUND_HALF_UP
              )
            );
            paid.push(input.amount + ' ' + obligation.currency);
          }
          await tx.activityLog.create({
            data: {
              branchId: item.branchId,
              userId: actor.userId,
              action: 'CUSTOMER_IMPORT_BALANCE_PAYMENT',
              entityType: 'Customer',
              entityId: item.customerId,
              details: {
                customerImportId: id,
                missingFromFile: true,
                accountCode: item.accountCode,
                lastSeenFile: item.lastSeen?.fileName ?? null,
                amounts: paid,
              },
              ipAddress: context.ipAddress,
            },
          });
          summary.settledMissing++;
          const cells = document.headers.map(() => '');
          const mapping = draft.columnMapping as ColumnMapping;
          if (mapping.accountCode != null) cells[mapping.accountCode] = item.accountCode ?? '';
          if (mapping.name != null) cells[mapping.name] = item.name;
          report.push([
            '',
            ...cells,
            'Not in file: settled ' + paid.join(', ') + ' in ' + item.branchName,
          ]);
        }
        summary.settledMissingTotalUsd = settledTotal.toFixed(2);
        summary.openingDebtTotalUsd = openingTotal.toFixed(2);
        summary.balanceIncreaseTotalUsd = increaseTotal.toFixed(2);
        summary.balancePaymentTotalUsd = paymentTotal.toFixed(2);
        summary.depositTotalUsd = depositTotal.toFixed(2);
        summary.depositUsedTotalUsd = depositUsedTotal.toFixed(2);
        const result = {
          ...summary,
          ...(childImportIds.length ? { childImportIds } : {}),
          reportCsv: report.map((cells) => cells.map(csvCell).join(',')).join('\r\n'),
        };
        await tx.customerImport.update({
          where: { id, branchId: draft.branchId },
          data: {
            status: 'COMMITTED',
            committedById: actor.userId,
            committedAt: new Date(),
            decisions: json(rows.map((row) => row.decision)),
            result: json(result),
          },
        });
        return result;
      },
      { timeoutMs: 120_000 }
    );
  }
}
function csvCell(value: string) {
  // Spreadsheet programs must not execute formulas from imported user text.
  const safe = /^[=+@\-\t\r]/.test(value) ? "'" + value : value;
  return '"' + safe.replace(/"/g, '""') + '"';
}
