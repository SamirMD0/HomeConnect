import fs from 'fs';
import crypto from 'crypto';
import { execFileSync } from 'child_process';
const db = JSON.parse(fs.readFileSync('e2e/.runtime/databases.json', 'utf8'));
const kind = process.argv[2] || 'restored';
if (
  !['restored', 'browser'].includes(kind) ||
  !/^hc_audit_test_/.test(new URL(db.urls[kind]).pathname.slice(1))
)
  throw new Error('Unsafe target');
process.env.DATABASE_URL = db.urls[kind];
process.env.JWT_SECRET = db.JWT_SECRET;
process.env.JWT_REFRESH_SECRET = db.JWT_REFRESH_SECRET;
process.env.LOG_DIR = 'e2e/.runtime/logs';
async function main() {
  const { ReportRowsService } =
    await import('../backend/src/features/reports/rows/report-rows.service');
  const { InventoryService } = await import('../backend/src/features/inventory/inventory.service');
  const { prisma } = await import('../backend/src/lib/prisma');
  try {
    const customers = await ReportRowsService.get('customers-financial-integrity', {
      period: 'thisMonth',
    });
    const suppliers = await ReportRowsService.get('suppliers-financial-integrity', {
      period: 'thisMonth',
    });
    const inventory = await InventoryService.getStockIntegrity();
    const maintenance = await InventoryService.getMaintenanceStockIntegrity();
    const { items: inventoryItems, ...inventorySummary } = inventory;
    const result = {
      database: db.names[kind],
      customers: customers.data.summary,
      suppliers: suppliers.data.summary,
      inventory: inventorySummary,
      maintenance: { available: maintenance.available },
      inventoryIssues: inventoryItems
        .filter((item) => item.status === 'MISMATCH')
        .map((item) => ({ sku: item.sku, status: item.status })),
    };
    fs.writeFileSync(
      `.claude/pre-release-audit/evidence/integrity-${kind}.json`,
      JSON.stringify(result, null, 2)
    );
    console.log(JSON.stringify(result));
    if (kind === 'restored') {
      const status = JSON.parse(
        fs.readFileSync('.claude/pre-release-audit/evidence/restored-migrations.json', 'utf8')
      );
      const comparisons = [];
      for (const name of status.status.mismatched) {
        const file = `backend/prisma/migrations/${name}/migration.sql`;
        const disk = fs.readFileSync(file, 'utf8');
        const head = execFileSync('git', ['show', `HEAD:${file}`], { encoding: 'utf8' });
        const stored = await prisma.$queryRawUnsafe<Array<{ checksum: string }>>(
          `SELECT checksum FROM _prisma_migrations WHERE migration_name='${name}' AND finished_at IS NOT NULL`
        );
        const hash = (s: string) => crypto.createHash('sha256').update(s).digest('hex');
        const original = name.includes('thermal')
          ? execFileSync('git', ['show', `4aa36bc:${file}`], { encoding: 'utf8' })
          : null;
        comparisons.push({
          name,
          stored,
          working: hash(disk),
          workingLF: hash(disk.replace(/\r\n/g, '\n')),
          workingCRLF: hash(disk.replace(/\r?\n/g, '\r\n')),
          head: hash(head),
          originalLF: original && hash(original.replace(/\r\n/g, '\n')),
          originalCRLF: original && hash(original.replace(/\r?\n/g, '\r\n')),
        });
      }
      fs.writeFileSync(
        '.claude/pre-release-audit/evidence/migration-checksums.json',
        JSON.stringify(comparisons, null, 2)
      );
      const archive = fs.readdirSync('e2e/.runtime').find((f) => f.endsWith('.backup'))!;
      fs.writeFileSync(
        '.claude/pre-release-audit/evidence/backup-verification.json',
        JSON.stringify(
          {
            archiveBytes: fs.statSync(`e2e/.runtime/${archive}`).size,
            sha256: crypto
              .createHash('sha256')
              .update(fs.readFileSync(`e2e/.runtime/${archive}`))
              .digest('hex'),
            readable: true,
            restoreExit: 0,
          },
          null,
          2
        )
      );
      const tables = await prisma.$queryRawUnsafe<Array<{ tablename: string }>>(
        `SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename`
      );
      const counts: Record<string, unknown> = {};
      for (const { tablename } of tables)
        counts[tablename] = await prisma.$queryRawUnsafe(
          `SELECT count(*)::int count FROM "${tablename.replace(/"/g, '""')}"`
        );
      const money: Record<string, unknown> = {};
      for (const [table, column] of [
        ['debts', 'originalAmount'],
        ['payments', 'totalAmount'],
        ['sales_orders', 'totalAmount'],
        ['supplier_transactions', 'amount'],
      ])
        money[`${table}.${column}`] = await prisma.$queryRawUnsafe(
          `SELECT COALESCE(SUM("${column}"),0)::text total FROM "${table}"`
        );
      const originalPaymentHash = await prisma.$queryRawUnsafe(
        `SELECT md5(COALESCE(string_agg(row_to_json(t)::text, '' ORDER BY t.id),'')) hash FROM (SELECT id,"customerId","totalAmount","paymentDate","voidedAt" FROM payments) t`
      );
      const thermal = await prisma.pricingCardTemplate.findUnique({
        where: { id: '20000000-0000-4000-8000-000000000005' },
        select: { cardWidthMm: true, cardHeightMm: true },
      });
      fs.writeFileSync(
        '.claude/pre-release-audit/evidence/restored-after.json',
        JSON.stringify({ counts, money, originalPaymentHash, thermal }, null, 2)
      );
    }
  } finally {
    await prisma.$disconnect();
  }
}
main().catch((e) => {
  console.error(e.message);
  process.exitCode = 1;
});
