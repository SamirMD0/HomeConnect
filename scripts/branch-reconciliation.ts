/** Read-only Phase 0/2 evidence. Never point this tool at a business database. */
import fs from 'node:fs';
import path from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import dotenv from 'dotenv';
import { Prisma, PrismaClient } from '@prisma/client';

export const ownedTables = [
  'customers',
  'suppliers',
  'sales_orders',
  'debts',
  'installment_plans',
  'payments',
  'sales_returns',
  'cash_refunds',
  'customer_credits',
  'supplier_transactions',
  'supplier_receivings',
  'service_jobs',
] as const;
export const parentRelations: Array<[string, string, string]> = [
  ...[
    'debts',
    'installment_plans',
    'customer_credits',
    'service_jobs',
    'sales_orders',
    'payments',
    'sales_returns',
    'cash_refunds',
  ].map((t) => [t, 'customerId', 'customers'] as [string, string, string]),
  ['payments', 'salesOrderId', 'sales_orders'],
  ['sales_returns', 'salesOrderId', 'sales_orders'],
  ['cash_refunds', 'salesReturnId', 'sales_returns'],
  ['customer_credits', 'salesReturnId', 'sales_returns'],
  ['supplier_transactions', 'supplierId', 'suppliers'],
  ['supplier_receivings', 'supplierId', 'suppliers'],
];

export function assertScratchDatabase(url: string | undefined): string {
  if (!url) throw new Error('DATABASE_URL is required; use a disposable database.');
  const name = decodeURIComponent(new URL(url).pathname.slice(1));
  if (!/^(?:homeconnect_(?:test|ci|rehearsal|reconcile)(?:[_-].*)?|hc_audit.*)$/i.test(name)) {
    throw new Error(
      'Refusing database "' + name + '": only named throwaway databases are allowed.'
    );
  }
  return name;
}

/** Ignore generation clocks and row ordering, never a business value. */
export function canonical(value: unknown): unknown {
  if (Array.isArray(value))
    return value.map(canonical).sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
  if (value && typeof value === 'object')
    return Object.fromEntries(
      Object.entries(value)
        .filter(([k]) => !['generatedAt', 'operationalSnapshotAt', 'branchId'].includes(k))
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([k, v]) => [k, canonical(v)])
    );
  return value;
}

async function branchSchema(db: PrismaClient) {
  const columns = await db.$queryRaw<
    Array<{ table_name: string }>
  >`SELECT table_name FROM information_schema.columns
    WHERE table_schema = 'public' AND column_name = 'branchId' AND table_name IN (${Prisma.join([...ownedTables])})`;
  if (columns.length === ownedTables.length) return true;
  if (columns.length > 1)
    throw new Error(
      'Partial branch schema: expected either the pre-branch schema or every ownership column.'
    );
  return false;
}

export async function closureChecks(db: PrismaClient) {
  if (!(await branchSchema(db))) {
    console.log('pre-branch schema: closure checks not applicable');
    return null;
  }
  const checks: Record<string, number> = {};
  async function count(name: string, sql: string) {
    const [row] = await db.$queryRawUnsafe<Array<{ n: number }>>(sql);
    checks[name] = row.n;
  }
  for (const table of ownedTables)
    await count(
      table + '.null_branch',
      'SELECT count(*)::int n FROM "' + table + '" WHERE "branchId" IS NULL'
    );
  for (const [child, key, parent] of parentRelations)
    await count(
      child + '.' + key,
      'SELECT count(*)::int n FROM "' +
        child +
        '" c JOIN "' +
        parent +
        '" p ON p.id=c."' +
        key +
        '" WHERE c."branchId" IS DISTINCT FROM p."branchId"'
    );
  for (const [link, sourceKey, source] of [
    ['payment_allocations', 'paymentId', 'payments'],
    ['sales_return_receivable_allocations', 'salesReturnId', 'sales_returns'],
    ['customer_credit_applications', 'customerCreditId', 'customer_credits'],
  ]) {
    for (const [key, parent, joins, branch] of [
      ['debtId', 'debts', '', 'p."branchId"'],
      [
        'installmentId',
        'installments',
        ' JOIN installment_plans plan ON plan.id=p."installmentPlanId"',
        'plan."branchId"',
      ],
      ...(link === 'customer_credit_applications'
        ? [
            ['salesOrderId', 'sales_orders', '', 'p."branchId"'],
            ['customerId', 'customers', '', 'p."branchId"'],
          ]
        : []),
    ])
      await count(
        link + '.' + key + '.branch_mismatch',
        'SELECT count(*)::int n FROM "' +
          link +
          '" a JOIN "' +
          source +
          '" s ON s.id=a."' +
          sourceKey +
          '" JOIN "' +
          parent +
          '" p ON p.id=a."' +
          key +
          '"' +
          joins +
          ' WHERE s."branchId" IS DISTINCT FROM ' +
          branch
      );
  }
  return checks;
}

function option(args: string[], key: string, required = true) {
  const i = args.indexOf(key);
  const value = i < 0 ? undefined : args[i + 1];
  if (required && (!value || value.startsWith('--'))) throw new Error('Missing ' + key);
  return value;
}

async function main() {
  dotenv.config({ path: path.resolve('backend/.env'), quiet: true });
  const database = assertScratchDatabase(process.env.DATABASE_URL);
  console.log('Confirmed scratch database: ' + database);
  const args = process.argv.slice(2),
    command = args[0];
  const db = new PrismaClient();
  try {
    if (command === 'compare') {
      const before = JSON.parse(fs.readFileSync(option(args, '--before')!, 'utf8'));
      const after = JSON.parse(fs.readFileSync(option(args, '--after')!, 'utf8'));
      const differences = Object.keys({ ...before, ...after }).filter(
        (k) => !isDeepStrictEqual(canonical(before[k]), canonical(after[k]))
      );
      const closure = await closureChecks(db);
      const failures = closure ? Object.entries(closure).filter(([, n]) => n !== 0) : [];
      console.log(
        'Snapshot differences: ' +
          differences.length +
          (differences.length ? ' (' + differences.join(', ') + ')' : '')
      );
      console.log(closure ? 'Closure checks: ' + JSON.stringify(closure) : '');
      console.log('branch_mismatch: ' + failures.reduce((n, [, v]) => n + v, 0));
      if (differences.length || failures.length) process.exitCode = 1;
      else console.log('COMPARE PASS');
      return;
    }
    if (command !== 'snapshot')
      throw new Error(
        'Usage: snapshot --out file.json --period YYYY-MM [--as-of YYYY-MM-DD] | compare --before a.json --after b.json'
      );
    const out = option(args, '--out')!,
      period = option(args, '--period')!;
    if (!/^\d{4}-\d{2}$/.test(period) || +period.slice(5) < 1 || +period.slice(5) > 12)
      throw new Error('--period must be YYYY-MM');
    const hasBranches = await branchSchema(db);
    // A final generated client must still read a pre-Phase-2 schema. Supply the
    // existing report services a client that explicitly selects legacy scalars.
    const models = new Map(Prisma.dmmf.datamodel.models.map((m) => [m.name, m]));
    const legacySelection = (
      model: string,
      params: Record<string, unknown>
    ): Record<string, unknown> => {
      const definition = models.get(model)!;
      const supplied = params.select as Record<string, unknown> | undefined;
      const select: Record<string, unknown> = supplied
        ? { ...supplied }
        : {
            ...Object.fromEntries(
              definition.fields
                .filter(
                  (f) =>
                    f.kind !== 'object' &&
                    (f.name !== 'branchId' ||
                      !ownedTables.includes(definition.dbName as (typeof ownedTables)[number]))
                )
                .map((f) => [f.name, true])
            ),
            ...(params.include as Record<string, unknown> | undefined),
          };
      for (const [key, value] of Object.entries(select)) {
        const field = definition.fields.find((f) => f.name === key);
        if (field?.kind === 'object' && value)
          select[key] = legacySelection(
            field.type,
            value === true ? {} : (value as Record<string, unknown>)
          );
      }
      const rest = { ...params };
      delete rest.include;
      return { ...rest, select };
    };
    const legacy = db.$extends({
      query: {
        $allModels: {
          $allOperations({ model, operation, args, query }) {
            if (
              !hasBranches &&
              [
                'findMany',
                'findFirst',
                'findUnique',
                'findFirstOrThrow',
                'findUniqueOrThrow',
              ].includes(operation)
            ) {
              return query(legacySelection(model, args as Record<string, unknown>) as typeof args);
            }
            return query(args);
          },
        },
      },
    });
    (global as unknown as { prisma: unknown }).prisma = legacy;
    const { ReportRowsService } =
      await import('../backend/src/features/reports/rows/report-rows.service.js');
    const { AnalysisService } =
      await import('../backend/src/features/reports/analysis/analysis.service.js');
    const { MonthlyReviewService } =
      await import('../backend/src/features/reports/monthly-review/monthly-review.service.js');
    const { todayInBusinessTimezone } = await import('../backend/src/features/financial/index.js');
    const businessDate = option(args, '--as-of', false) ?? todayInBusinessTimezone();
    const options = { businessDate, generatedAt: new Date('2000-01-01T00:00:00.000Z') };
    const counts: Record<string, number> = {};
    for (const table of ownedTables) {
      const [row] = await db.$queryRawUnsafe<Array<{ n: number }>>(
        'SELECT count(*)::int n FROM "' + table + '"'
      );
      counts[table] = row.n;
    }
    const independentCustomers = await db.$queryRawUnsafe(
      'SELECT evidence.*, ("obligationTotal"::numeric - "allocationTotal"::numeric)::text AS outstanding FROM (\r\n      WITH obligation_rows AS (\r\n        SELECT d."customerId", d."baseOriginalAmount" AS amount\r\n        FROM "debts" d\r\n        WHERE d."kind" <> \'PREPAID_PURCHASE\'\r\n          AND d."status" <> \'CANCELLED\'\r\n          AND d."cancelledAt" IS NULL\r\n        UNION ALL\r\n        SELECT p."customerId", i."baseAmountDue" AS amount\r\n        FROM "installments" i\r\n        JOIN "installment_plans" p ON p."id" = i."installmentPlanId"\r\n        WHERE p."status" <> \'CANCELLED\'\r\n          AND p."cancelledAt" IS NULL\r\n          AND i."status" <> \'CANCELLED\'\r\n      ),\r\n      obligation_totals AS (\r\n        SELECT "customerId", SUM(amount) AS amount, COUNT(*)::integer AS count\r\n        FROM obligation_rows\r\n        GROUP BY "customerId"\r\n      ),\r\n      allocation_rows AS (\r\n        SELECT d."customerId",\r\n          CASE WHEN payment."currency" = \'USD\'\r\n            THEN a."paymentAmount"\r\n            ELSE a."paymentAmount" / payment."exchangeRate"\r\n          END AS amount\r\n        FROM "payment_allocations" a\r\n        JOIN "payments" payment ON payment."id" = a."paymentId"\r\n        JOIN "debts" d ON d."id" = a."debtId"\r\n        WHERE a."voidedAt" IS NULL\r\n          AND payment."voidedAt" IS NULL\r\n          AND d."kind" <> \'PREPAID_PURCHASE\'\r\n          AND d."status" <> \'CANCELLED\'\r\n          AND d."cancelledAt" IS NULL\r\n        UNION ALL\r\n        SELECT p."customerId",\r\n          CASE WHEN payment."currency" = \'USD\'\r\n            THEN a."paymentAmount"\r\n            ELSE a."paymentAmount" / payment."exchangeRate"\r\n          END AS amount\r\n        FROM "payment_allocations" a\r\n        JOIN "payments" payment ON payment."id" = a."paymentId"\r\n        JOIN "installments" i ON i."id" = a."installmentId"\r\n        JOIN "installment_plans" p ON p."id" = i."installmentPlanId"\r\n        WHERE a."voidedAt" IS NULL\r\n          AND payment."voidedAt" IS NULL\r\n          AND p."status" <> \'CANCELLED\'\r\n          AND p."cancelledAt" IS NULL\r\n          AND i."status" <> \'CANCELLED\'\r\n        UNION ALL\r\n        SELECT d."customerId", a."baseAmount" AS amount\r\n        FROM "sales_return_receivable_allocations" a\r\n        JOIN "debts" d ON d."id" = a."debtId"\r\n        WHERE d."kind" <> \'PREPAID_PURCHASE\'\r\n          AND d."status" <> \'CANCELLED\'\r\n          AND d."cancelledAt" IS NULL\r\n        UNION ALL\r\n        SELECT p."customerId", a."baseAmount" AS amount\r\n        FROM "sales_return_receivable_allocations" a\r\n        JOIN "installments" i ON i."id" = a."installmentId"\r\n        JOIN "installment_plans" p ON p."id" = i."installmentPlanId"\r\n        WHERE p."status" <> \'CANCELLED\'\r\n          AND p."cancelledAt" IS NULL\r\n          AND i."status" <> \'CANCELLED\'\r\n      ),\r\n      allocation_totals AS (\r\n        SELECT "customerId", SUM(amount) AS amount, COUNT(*)::integer AS count\r\n        FROM allocation_rows\r\n        GROUP BY "customerId"\r\n      )\r\n      SELECT\r\n        customer."id" AS "customerId",\r\n        customer."name" AS "customerName",\r\n        customer."phone" AS "customerPhone",\r\n        COALESCE(obligations.amount, 0)::text AS "obligationTotal",\r\n        COALESCE(allocations.amount, 0)::text AS "allocationTotal",\r\n        COALESCE(obligations.count, 0)::integer AS "obligationCount",\r\n        COALESCE(allocations.count, 0)::integer AS "allocationCount"\r\n      FROM "customers" customer\r\n      LEFT JOIN obligation_totals obligations ON obligations."customerId" = customer."id"\r\n      LEFT JOIN allocation_totals allocations ON allocations."customerId" = customer."id"\r\n      WHERE customer."deletedAt" IS NULL\r\n      ORDER BY customer."name" ASC, customer."id" ASC\r\n    ) evidence'
    );
    const independentSuppliers = await db.$queryRawUnsafe(
      'SELECT evidence.*, ("increaseTotal"::numeric - "decreaseTotal"::numeric)::text AS owed FROM (\r\n      WITH transaction_totals AS (\r\n        SELECT\r\n          st."supplierId",\r\n          COALESCE(SUM(st."baseAmount") FILTER (\r\n            WHERE st."status" = \'ACTIVE\' AND st."direction" = \'INCREASE_OWED\'\r\n          ), 0) AS increases,\r\n          COALESCE(SUM(st."baseAmount") FILTER (\r\n            WHERE st."status" = \'ACTIVE\' AND st."direction" = \'DECREASE_OWED\'\r\n          ), 0) AS decreases,\r\n          COUNT(*) FILTER (WHERE st."status" = \'ACTIVE\')::integer AS count\r\n        FROM "supplier_transactions" st\r\n        GROUP BY st."supplierId"\r\n      )\r\n      SELECT\r\n        supplier."id" AS "supplierId",\r\n        supplier."name" AS "supplierName",\r\n        supplier."phone" AS "supplierPhone",\r\n        COALESCE(totals.increases, 0)::text AS "increaseTotal",\r\n        COALESCE(totals.decreases, 0)::text AS "decreaseTotal",\r\n        COALESCE(totals.count, 0)::integer AS "transactionCount"\r\n      FROM "suppliers" supplier\r\n      LEFT JOIN transaction_totals totals ON totals."supplierId" = supplier."id"\r\n      ORDER BY supplier."name" ASC, supplier."id" ASC\r\n    ) evidence'
    );
    const queries = [
      { period: 'thisMonth' as const },
      { period: 'lastMonth' as const },
      {
        period: 'custom' as const,
        from: period + '-01',
        to:
          period + '-' + new Date(Date.UTC(+period.slice(0, 4), +period.slice(5), 0)).getUTCDate(),
      },
    ];
    const reports = [];
    for (const query of queries)
      reports.push({
        query,
        analysis: (await AnalysisService.get(query, options)).data,
        monthlyReview: (await MonthlyReviewService.get(query, options)).data,
        receivablesAging: (await ReportRowsService.get('customers-aging', query, options)).data,
        payablesAging: (await ReportRowsService.get('suppliers-aging', query, options)).data,
      });
    const evidence = {
      version: 1,
      businessDate,
      period,
      counts,
      independentCustomers,
      independentSuppliers,
      customersIntegrity: (
        await ReportRowsService.get(
          'customers-financial-integrity',
          { period: 'thisMonth' },
          options
        )
      ).data,
      suppliersIntegrity: (
        await ReportRowsService.get(
          'suppliers-financial-integrity',
          { period: 'thisMonth' },
          options
        )
      ).data,
      reports,
    };
    fs.writeFileSync(out, JSON.stringify(canonical(evidence), null, 2) + '\n');
    console.log('SNAPSHOT PASS: ' + out);
  } finally {
    await db.$disconnect();
  }
}
if (require.main === module)
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : 'Reconciliation failed');
    process.exitCode = 1;
  });
