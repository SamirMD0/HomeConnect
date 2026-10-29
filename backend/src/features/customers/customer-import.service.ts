import { Prisma } from '@prisma/client';
import { AppError, AuthorizationError, NotFoundError, ValidationError } from '../../lib/errors';
import { importFileHash } from '../../lib/csv-import';
import { normalizePhoneTerm, normalizeSearchTerm } from '../../lib/search-normalize';
import { verifyAdminPassword } from '../../lib/admin-verification';
import { assertCreditLimitPermission } from '../../services/customers.service';
import { assertInScope } from '../branches/branch-scope';
import { BranchesService, type BranchActor } from '../branches/branches.service';
import { runFinancialTransaction } from '../financial/infrastructure/transaction';
import { DebtsRepository } from '../financial/debts/debts.repository';
import { ExchangeRatesService } from '../financial/exchange-rates/exchange-rates.service';
import { parseMoney, toBaseAmount } from '../financial/domain/money';
import { businessDateToPrisma, todayInBusinessTimezone } from '../financial/domain/business-date';
import { calculateDebtBalance } from '../financial/domain/balances';
import { determineDebtStatus } from '../financial/domain/statuses';
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

export async function buildCustomerImportPreview(draft: Draft, tx: Client) {
  const document = draft.rows as unknown as CsvDocument;
  const mapping = draft.columnMapping as ColumnMapping;
  const parsed = mapCustomerRows(document, mapping);
  // Matching targets are ALWAYS restricted to the immutable destination.
  const customers = await tx.customer.findMany({
    where: { branchId: draft.branchId, deletedAt: null },
    include: { debts: { where: { sourceCustomerImportId: { not: null } }, select: { id: true } } },
  });
  const previousCommittedImport = await tx.customerImport.findFirst({
    where: {
      branchId: draft.branchId,
      fileHash: draft.fileHash,
      status: 'COMMITTED',
      id: { not: draft.id },
    },
    select: { id: true, fileName: true, committedAt: true },
    orderBy: { committedAt: 'desc' },
  });
  const actor = await tx.user.findUniqueOrThrow({
    where: { id: draft.createdById },
    select: { role: true },
  });
  // Cross-branch rows are hints only, limited to branches the draft owner can see.
  const accessible = await BranchesService.accessibleBranches(
    { userId: draft.createdById, role: actor.role },
    tx
  );
  const others = await tx.customer.findMany({
    where: {
      branchId: { in: accessible.map((branch) => branch.id).filter((id) => id !== draft.branchId) },
      deletedAt: null,
    },
    select: { phone: true, branch: { select: { id: true, name: true } } },
  });
  const counts = new Map<string, number>();
  for (const row of parsed)
    if (row.phoneKey) counts.set(row.phoneKey, (counts.get(row.phoneKey) ?? 0) + 1);
  const supplied = new Map(
    ((draft.decisions ?? []) as unknown as CustomerImportDecision[]).map((decision) => [
      decision.rowNumber,
      decision,
    ])
  );
  const rows = parsed.map((row) => {
    const matches = customers
      .filter((customer) => normalizePhoneTerm(customer.phone) === row.phoneKey && row.phoneKey)
      .map((customer) => ({
        id: customer.id,
        name: customer.name,
        phone: customer.phone,
        isActive: customer.isActive,
        hasImportedOpeningDebt: customer.debts.length > 0,
      }));
    const conflicts: Array<{
      kind:
        'FILE_PHONE' | 'EXISTING_PHONE' | 'OTHER_BRANCH_PHONE' | 'NAME_SIMILAR' | 'OPENING_DEBT';
      message: string;
      blocking: boolean;
    }> = [];
    if ((counts.get(row.phoneKey) ?? 0) > 1)
      conflicts.push({
        kind: 'FILE_PHONE',
        message: 'Phone occurs more than once in this file; select one row and skip the others',
        blocking: true,
      });
    if (matches.length)
      conflicts.push({
        kind: 'EXISTING_PHONE',
        message:
          matches.length === 1
            ? 'Phone already exists in this branch: update selected fields or skip'
            : 'Multiple existing customers share this phone key; skip this row and resolve the duplicate manually',
        blocking: true,
      });
    for (const branch of new Map(
      others
        .filter((other) => row.phoneKey && normalizePhoneTerm(other.phone) === row.phoneKey)
        .map((other) => [other.branch.id, other.branch])
    ).values())
      conflicts.push({
        kind: 'OTHER_BRANCH_PHONE',
        message: 'Also exists in branch: ' + branch.name,
        blocking: false,
      });
    if (
      customers.some(
        (customer) =>
          normalizeSearchTerm(customer.name).trim() === normalizeSearchTerm(row.name).trim() &&
          normalizePhoneTerm(customer.phone) !== row.phoneKey
      )
    )
      conflicts.push({
        kind: 'NAME_SIMILAR',
        message: 'Similar name with another phone in this branch',
        blocking: false,
      });
    if (matches.some((match) => match.hasImportedOpeningDebt) && Number(row.openingBalance) > 0)
      conflicts.push({
        kind: 'OPENING_DEBT',
        message:
          'This customer already has an imported opening debt; skip the opening amount or the row',
        blocking: true,
      });
    const defaultDecision: CustomerImportDecision =
      row.issues.length || (previousCommittedImport && matches.length) || matches.length > 1
        ? { rowNumber: row.rowNumber, action: 'SKIP' }
        : matches.length === 1
          ? {
              rowNumber: row.rowNumber,
              action: 'UPDATE',
              targetCustomerId: matches[0].id,
              updateFields: (['name', 'address', 'notes', 'creditLimit'] as const).filter(
                (field) => mapping[field] != null && row[field] !== undefined
              ),
            }
          : { rowNumber: row.rowNumber, action: 'CREATE' };
    const fingerprint = JSON.stringify(
      matches.map((match) => [match.id, match.hasImportedOpeningDebt, match.isActive]).sort()
    );
    return {
      ...row,
      matches,
      conflicts,
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
  let openingDebtTotalUsd = new Prisma.Decimal(0);
  let openingDebts = 0;
  const rates = new Map<'USD' | 'LBP', Prisma.Decimal>();
  for (const row of rows) {
    if (
      !row.issues.length &&
      row.decision.action !== 'SKIP' &&
      !row.decision.skipOpeningBalance &&
      Number(row.openingBalance) > 0
    ) {
      const rate =
        rates.get(row.currency) ??
        (await ExchangeRatesService.snapshotFor(row.currency, new Date(), tx));
      rates.set(row.currency, rate);
      openingDebtTotalUsd = openingDebtTotalUsd.plus(
        toBaseAmount(
          parseMoney(row.openingBalance, row.currency),
          row.currency,
          rate,
          Prisma.Decimal.ROUND_HALF_UP
        )
      );
      openingDebts++;
    }
  }
  const planned = {
    created: rows.filter((row) => row.decision.action === 'CREATE').length,
    updated: rows.filter((row) => row.decision.action === 'UPDATE').length,
    skipped: rows.filter((row) => row.decision.action === 'SKIP').length,
    openingDebts,
    openingDebtTotalUsd: openingDebtTotalUsd.toFixed(2),
  };
  return {
    planned,
    id: draft.id,
    branchId: draft.branchId,
    fileName: draft.fileName,
    status: draft.status,
    headers: document.headers,
    columnMapping: mapping,
    rows,
    summary,
    previousCommittedImport,
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
      const draft = await tx.customerImport.update({
        where: { id, branchId: existing.branchId },
        data: {
          ...(values.columnMapping
            ? { columnMapping: json(values.columnMapping), decisions: Prisma.DbNull }
            : {}),
          ...(values.decisions ? { decisions: json(values.decisions) } : {}),
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
        const snapshot = (draft.rows as unknown as CsvDocument).snapshot ?? {};
        const chosenKeys = new Set<string>();
        for (const row of rows) {
          const decision = row.decision;
          if (decision.action === 'SKIP') continue;
          if (row.issues.length)
            throw unresolved(
              'Invalid row ' + row.rowNumber + ' must be skipped or corrected in the source file'
            );
          if (snapshot[row.rowNumber] !== row.fingerprint)
            throw stale(
              'Matching customers or imported opening debts changed for row ' + row.rowNumber + '.'
            );
          if (chosenKeys.has(row.phoneKey))
            throw unresolved('Choose one row for duplicate phone ' + row.phone);
          chosenKeys.add(row.phoneKey);
          if (decision.action === 'CREATE' && row.matches.length)
            throw unresolved('Existing phone must be updated or skipped');
          if (
            decision.action === 'UPDATE' &&
            (row.matches.length !== 1 || row.matches[0].id !== decision.targetCustomerId)
          )
            throw unresolved(
              'UPDATE must target the sole matching customer in the destination branch'
            );
          if (
            decision.action === 'UPDATE' &&
            row.matches[0].hasImportedOpeningDebt &&
            Number(row.openingBalance) > 0 &&
            !decision.skipOpeningBalance
          )
            throw unresolved(
              'Row ' +
                row.rowNumber +
                ': skip the opening balance because this customer already has an imported opening debt'
            );
        }
        const openingRows = rows.filter(
          (row) =>
            row.decision.action !== 'SKIP' &&
            !row.decision.skipOpeningBalance &&
            Number(row.openingBalance) > 0
        );
        if (openingRows.length) {
          if (!values.accountPassword)
            throw new ValidationError('Account password is required for opening debts');
          await verifyAdminPassword(
            actor.userId,
            values.accountPassword,
            {
              action: 'COMMIT_CUSTOMER_CSV_IMPORT',
              recordType: 'CUSTOMER_IMPORT',
              recordId: id,
              ipAddress: context.ipAddress,
              domainLabel: 'customer opening debts',
            },
            tx
          );
        }
        const summary = {
          created: 0,
          updated: 0,
          skipped: 0,
          invalid: 0,
          openingDebts: 0,
          openingDebtTotalUsd: '0.00',
        };
        let total = new Prisma.Decimal(0);
        const report: string[][] = [['Row', ...preview.headers, 'Reason']];
        for (const row of rows) {
          const decision = row.decision;
          if (decision.action === 'SKIP') {
            summary.skipped++;
            if (row.status === 'INVALID') summary.invalid++;
            report.push([
              String(row.rowNumber),
              ...(draft.rows as unknown as CsvDocument).records[row.rowNumber - 2],
              [...row.issues, ...row.conflicts.map((conflict) => conflict.message)].join('; ') ||
                'Skipped by user',
            ]);
            continue;
          }
          let customerId: string;
          if (decision.action === 'CREATE') {
            assertCreditLimitPermission(row, actor);
            const customer = await tx.customer.create({
              data: {
                branchId: draft.branchId,
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
            const data = Object.fromEntries(
              (decision.updateFields ?? [])
                .filter((field) => row[field] !== undefined)
                .map((field) => [field, row[field]])
            );
            assertCreditLimitPermission(data, actor);
            if (Object.keys(data).length)
              await tx.customer.update({
                where: { id: customerId, branchId: draft.branchId, deletedAt: null },
                data,
              });
            summary.updated++;
          }
          await tx.activityLog.create({
            data: {
              branchId: draft.branchId,
              userId: actor.userId,
              entityType: 'Customer',
              entityId: customerId,
              action: decision.action === 'CREATE' ? 'CUSTOMER_CREATED' : 'CUSTOMER_UPDATED',
              details: {
                customerImportId: id,
                rowNumber: row.rowNumber,
                updateFields: decision.updateFields ?? [],
              },
              ipAddress: context.ipAddress,
            },
          });
          if (!decision.skipOpeningBalance && Number(row.openingBalance) > 0) {
            // The transactional recheck also covers duplicates selected within this batch.
            if (
              await tx.debt.findFirst({
                where: {
                  customerId,
                  branchId: draft.branchId,
                  sourceCustomerImportId: { not: null },
                },
                select: { id: true },
              })
            )
              throw stale('An imported opening debt already exists.');
            const amount = parseMoney(row.openingBalance, row.currency);
            const exchangeRate = await ExchangeRatesService.snapshotFor(
              row.currency,
              new Date(),
              tx
            );
            const baseOriginalAmount = toBaseAmount(
              amount,
              row.currency,
              exchangeRate,
              Prisma.Decimal.ROUND_HALF_UP
            );
            const dueDate = row.dueDate ?? todayInBusinessTimezone();
            const debt = await DebtsRepository.createDebt(
              {
                customerId,
                description: 'Opening balance — import ' + draft.fileName,
                kind: 'STANDARD',
                originalAmount: amount,
                currency: row.currency,
                exchangeRate,
                baseOriginalAmount,
                dueDate: businessDateToPrisma(dueDate),
                status: determineDebtStatus({
                  isCancelled: false,
                  dueDate,
                  businessDate: todayInBusinessTimezone(),
                  balance: calculateDebtBalance({ originalAmount: amount }),
                  overdueEligible: true,
                }),
                createdById: actor.userId,
                sourceCustomerImportId: id,
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
                  baseOriginalAmount: baseOriginalAmount.toFixed(2),
                },
                ipAddress: context.ipAddress,
              },
            });
            summary.openingDebts++;
            total = total.plus(baseOriginalAmount);
          }
        }
        summary.openingDebtTotalUsd = total.toFixed(2);
        const result = {
          ...summary,
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
