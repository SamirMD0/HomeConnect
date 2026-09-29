/** Read-only Phase 1 compatibility evidence; never migrates or backfills. */
import { execFileSync } from 'node:child_process';
import { PrismaClient } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';

async function main() {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required');
  const url = new URL(process.env.DATABASE_URL);
  url.searchParams.set('connection_limit', '1');
  const db = new PrismaClient({ datasourceUrl: url.toString() });
  // The application read models below must share this single read-only session.
  (global as unknown as { prisma: PrismaClient }).prisma = db;
  try {
    await db.$executeRawUnsafe('SET default_transaction_read_only = on');
    const { ReceivablesService } = await import('../src/features/financial/receivables/receivables.service');
    const { ReportRowsService } = await import('../src/features/reports/rows/report-rows.service');
    const committed = execFileSync('git', ['show', 'develop:backend/src/features/reports/rows/report-rows.repository.ts'], { encoding: 'utf8' });
    const phase1Sql = committed.match(/static customerFinancialIntegrity\(\)\s*\{\s*return prisma\.\$queryRaw<CustomerFinancialIntegrityEvidence\[\]>`([\s\S]*?)`;/)?.[1];
    if (!phase1Sql || !phase1Sql.trimStart().startsWith('WITH obligation_rows AS') || phase1Sql.includes('${')) {
      throw new Error('Expected immutable, non-parameterized Phase 1 integrity SQL was not found');
    }
    type Evidence = { customerId: string; obligationTotal: string; allocationTotal: string };
    const snapshot = async () => db.$transaction(async (tx) => {
      const evidence = await tx.$queryRawUnsafe<Evidence[]>(phase1Sql);
      const payments = await tx.$queryRaw<Array<{ count: number; baseTotal: string; checksum: string | null }>>`
        SELECT COUNT(*)::integer AS count, COALESCE(SUM("baseAmount"), 0)::text AS "baseTotal",
          MD5(STRING_AGG(TO_JSONB(p)::text, '|' ORDER BY p."id")) AS checksum FROM "payments" p`;
      return { evidence, payments: payments[0] };
    }, { isolationLevel: 'RepeatableRead' });
    const before = await snapshot();
    const projections = await ReceivablesService.computeReceivableProjections({ customerIds: before.evidence.map((row) => row.customerId) });
    let reported = new Decimal(0);
    let independent = new Decimal(0);
    let mismatches = 0;
    for (const row of before.evidence) {
      const expected = new Decimal(row.obligationTotal).minus(row.allocationTotal);
      const actual = new Decimal(projections.get(row.customerId)?.outstanding ?? '0');
      reported = reported.plus(actual);
      independent = independent.plus(expected);
      if (!projections.has(row.customerId) || !actual.equals(expected)) mismatches += 1;
    }
    let currentReport: unknown;
    try {
      const current = await ReportRowsService.get('customers-financial-integrity', { period: 'thisMonth' });
      currentReport = { status: 'available', summary: current.data.summary };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (!message.includes('sales_return_receivable_allocations')) throw error;
      currentReport = { status: 'blocked', reason: 'Business database has not received the separately blocked Phase 2 return migration' };
    }
    const after = await snapshot();
    console.log(JSON.stringify({
      database: url.pathname.slice(1), readOnly: true,
      phase1Compatibility: { source: 'committed develop Phase 1 SQL plus existing receivables projections', customers: before.evidence.length,
        mismatches, reportedOutstanding: reported.toFixed(2), independentOutstanding: independent.toFixed(2) },
      currentReport, beforePayments: before.payments, afterPayments: after.payments,
      legacyPaymentsUnchanged: JSON.stringify(before.payments) === JSON.stringify(after.payments),
      obligationAllocationEvidenceUnchanged: JSON.stringify(before.evidence) === JSON.stringify(after.evidence),
    }, null, 2));
    if (mismatches || JSON.stringify(before) !== JSON.stringify(after)) process.exitCode = 1;
  } finally {
    await db.$disconnect();
  }
}
main().catch((error: unknown) => {
  // Do not print connection strings or query error dumps containing business data.
  console.error(error instanceof Error ? error.name : 'ReadOnlyVerificationError');
  process.exitCode = 1;
});
