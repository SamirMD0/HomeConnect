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
import { DebtsService } from '../financial/debts/debts.service';
import { InstallmentPlansService } from '../financial/installment-plans/installment-plans.service';
import { ExchangeRatesService } from '../financial/exchange-rates/exchange-rates.service';
import { moneyToApiString, parseMoney, toBaseAmount } from '../financial/domain/money';
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
const changesMoney = (row: {
  balance: { kind: string };
  decision: Pick<CustomerImportDecision, 'action' | 'skipOpeningBalance'>;
}) =>
  row.decision.action !== 'SKIP' &&
  !row.decision.skipOpeningBalance &&
  (MONEY_CHANGES as readonly string[]).includes(row.balance.kind);
const addsDebt = (row: Parameters<typeof changesMoney>[0]) =>
  changesMoney(row) && row.balance.kind !== 'DECREASE';
const absoluteDifference = (row: { balance: { difference: string }; currency: 'USD' | 'LBP' }) =>
  parseMoney(row.balance.difference, row.currency).abs();
const branchKey = (value: string) => value.trim().toLowerCase();

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
  const branches = new Map(accessible.map((branch) => [branch.id, branch]));
  const namedBranches = new Map<string, string>();
  for (const branch of accessible)
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
  const placed = parsed.map((row) => {
    const chosen = document.rowBranches?.[row.rowNumber];
    const named = row.branchValue ? namedBranches.get(branchKey(row.branchValue)) : undefined;
    if (chosen && !branches.has(chosen)) row.issues.push('The selected branch is not available');
    if (row.branchValue && !named && !chosen)
      row.issues.push('Branch "' + row.branchValue + '" was not found');
    const accountHits = (row.accountCode && byAccount.get(row.accountCode)) || [];
    const phoneHits = (row.phoneKey && byPhone.get(row.phoneKey)) || [];
    const existing = accountHits.length
      ? accountHits
      : phoneHits.length
        ? phoneHits
        : sameName(row);
    const homes = [...new Set(existing.map((customer) => customer.branchId))];
    const home =
      homes.length === 1
        ? homes[0]
        : homes.includes(draft.branchId) || !homes.length
          ? draft.branchId
          : null;
    // A Branch column places new customers only; known customers stay in their own branch.
    const decided = chosen ?? (existing.length ? home : (named ?? home));
    const elsewhere = Boolean(chosen && homes.length && !homes.includes(chosen));
    const toMove = elsewhere && existing.length === 1 && !existing[0].deletedAt ? existing[0] : null;
    return {
      ...row,
      branchId: decided ?? draft.branchId,
      ambiguous: !decided || (elsewhere && !toMove),
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
    const nameMatches =
      accountMatches.length || phoneMatches.length ? [] : inBranch(sameName(row));
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
        message:
          'This customer exists in several branches; choose a branch where they already are, or skip',
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
    const state = matches.length === 1 ? balances.get(matches[0].id) : undefined;
    const balance = classifyBalance(
      matches.length > 1 ? { ...row, hasBalance: false } : row,
      state
    );
    if (balance.kind === 'CURRENCY_MISMATCH')
      conflicts.push({
        kind: 'BALANCE_CURRENCY',
        message:
          'This customer has open balances in another currency; the balance will not be changed',
        blocking: false,
      });
    // An older file looks like an increase after a payment taken in HomeConnect.
    const stale =
      Boolean(state?.activitySinceLastImport) &&
      (balance.kind === 'INCREASE' || balance.kind === 'NEW');
    if (stale)
      conflicts.push({
        kind: 'BALANCE_ACTIVITY',
        message: 'Activity since last import; check that this file is newer',
        blocking: false,
      });
    const defaultDecision: CustomerImportDecision =
      row.issues.length ||
      row.ambiguous ||
      (previousImports.has(row.branchId) && matches.length) ||
      matches.length > 1
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
              ...(stale ? { skipOpeningBalance: true } : {}),
            }
          : { rowNumber: row.rowNumber, action: 'CREATE' };
    const fingerprint = JSON.stringify([
      row.branchId,
      row.toMove?.branchId ?? null,
      matches
        .map((match) => [match.id, match.isActive, match.accountCodes])
        .sort(),
      (state?.obligations ?? []).map((item) => [item.id, item.remaining.toFixed(2)]),
      Boolean(state?.activitySinceLastImport),
    ]);
    const { ambiguous: _ambiguous, toMove: _toMove, existingBranches, ...fields } = row;
    return {
      ...fields,
      branchName: branchName(row.branchId),
      matchedBy,
      moveFrom: row.toMove
        ? { branchId: row.toMove.branchId, branchName: branchName(row.toMove.branchId) }
        : null,
      existingBranches: existingBranches.map((id) => ({ id, name: branchName(id) })),
      matches,
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
  const summary = {
    total: rows.length,
    ready: rows.filter((row) => row.status === 'READY').length,
    conflicts: rows.filter((row) => row.status === 'CONFLICT').length,
    invalid: rows.filter((row) => row.status === 'INVALID').length,
  };
  const totals = {
    NEW: { count: 0, usd: new Prisma.Decimal(0) },
    INCREASE: { count: 0, usd: new Prisma.Decimal(0) },
    DECREASE: { count: 0, usd: new Prisma.Decimal(0) },
  };
  const rates = new Map<'USD' | 'LBP', Prisma.Decimal>();
  for (const row of rows) {
    if (!changesMoney(row)) continue;
    const rate =
      rates.get(row.currency) ??
      (await ExchangeRatesService.snapshotFor(row.currency, new Date(), tx));
    rates.set(row.currency, rate);
    const total = totals[row.balance.kind as keyof typeof totals];
    total.count++;
    total.usd = total.usd.plus(
      toBaseAmount(absoluteDifference(row), row.currency, rate, Prisma.Decimal.ROUND_HALF_UP)
    );
  }
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
    branches: accessible.map((branch) => ({ id: branch.id, code: branch.code, name: branch.name })),
    rows,
    summary,
    previousCommittedImport:
      previousImports.get(draft.branchId) ??
      rows.map((row) => previousImports.get(row.branchId)).find(Boolean) ??
      null,
    result: draft.result,
  };
}
type Preview = Awaited<ReturnType<typeof buildCustomerImportPreview>>;
function validateDecisions(preview: Preview, decisions: CustomerImportDecision[]) {
  const rowNumbers = new Set(preview.rows.map((row) => row.rowNumber));
  if (decisions.some((decision) => !rowNumbers.has(decision.rowNumber)))
    throw new ValidationError('Decision refers to a row outside this import');
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
        if (branchId) await checkedBranch(branchId, actor, tx);
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
          ...(values.rowBranches
            ? {
                rows: json({
                  ...document,
                  // JSON drops the undefined entries, returning those rows to their own branch.
                  rowBranches: {
                    ...document.rowBranches,
                    ...Object.fromEntries(
                      values.rowBranches.map((item) => [
                        item.rowNumber,
                        item.branchId ?? undefined,
                      ])
                    ),
                  },
                }),
              }
            : {}),
        },
      });
      const preview = await saveSnapshot(draft, tx);
      validateDecisions(preview, values.decisions ?? []);
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
        validateDecisions(preview, values.decisions);
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
            throw stale(
              'Matching customers or balances changed for row ' + row.rowNumber + '.'
            );
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
        const acting = rows.filter((row) => row.decision.action !== 'SKIP');
        // The destination check covers revocation and deactivation since the preview.
        for (const branchId of new Set(acting.map((row) => row.branchId)))
          await checkedBranch(branchId, actor, tx);
        if (rows.some((row) => addsDebt(row) && !row.dueDate) && !values.dueDate)
          throw new ValidationError('Choose a due date for the new debts');
        const defaultDueDate = values.dueDate ? parseBusinessDate(values.dueDate) : null;
        if (rows.some(changesMoney)) {
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
            .filter((row) => changesMoney(row) && row.balance.kind === 'DECREASE')
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
        };
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
          const amount = absoluteDifference(row);
          const exchangeRate = await ExchangeRatesService.snapshotFor(row.currency, new Date(), tx);
          const baseAmount = toBaseAmount(
            amount,
            row.currency,
            exchangeRate,
            Prisma.Decimal.ROUND_HALF_UP
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
                await DebtsService.recordDebtPaymentInTransaction(tx, payment.id, input, actor, scope);
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
          reportRow(
            row,
            'Balance ' +
              row.balance.current +
              ' to ' +
              row.balance.file +
              ' ' +
              row.currency +
              ' in ' +
              row.branchName
          );
        }
        summary.openingDebtTotalUsd = openingTotal.toFixed(2);
        summary.balanceIncreaseTotalUsd = increaseTotal.toFixed(2);
        summary.balancePaymentTotalUsd = paymentTotal.toFixed(2);
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
