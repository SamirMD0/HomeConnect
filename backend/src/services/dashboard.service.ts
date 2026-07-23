import { prisma } from '../lib/prisma';

export class DashboardService {
  static async getSummary() {
    // Total active customers
    const totalCustomers = await prisma.customer.count({
      where: { deletedAt: null }
    });

    // Customers with debt and Total Debt using raw SQL
    // Balance = SUM(SALE) - SUM(PAYMENT) + SUM(ADJUSTMENT)
    const debtStats: any[] = await prisma.$queryRaw`
      WITH CustomerBalances AS (
        SELECT
          "customerId",
          COALESCE(SUM(CASE WHEN type = 'SALE' THEN amount ELSE 0 END), 0) -
          COALESCE(SUM(CASE WHEN type = 'PAYMENT' THEN amount ELSE 0 END), 0) +
          COALESCE(SUM(CASE WHEN type = 'ADJUSTMENT' THEN amount ELSE 0 END), 0) AS balance
        FROM transactions
        WHERE "deletedAt" IS NULL
        GROUP BY "customerId"
      )
      SELECT
        COUNT(*)::int as customers_with_debt,
        COALESCE(SUM(balance), 0)::numeric as total_debt
      FROM CustomerBalances
      WHERE balance > 0
    `;

    const customersWithDebt = Number(debtStats[0]?.customers_with_debt || 0);
    const totalDebt = Number(debtStats[0]?.total_debt || 0);

    // Payments and Sales today/month
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);

    const periodStats: any[] = await prisma.$queryRaw`
      SELECT
        COALESCE(SUM(CASE WHEN type = 'PAYMENT' AND date >= ${today} THEN amount ELSE 0 END), 0)::numeric as payments_today,
        COALESCE(SUM(CASE WHEN type = 'PAYMENT' AND date >= ${startOfMonth} THEN amount ELSE 0 END), 0)::numeric as payments_month,
        COALESCE(SUM(CASE WHEN type = 'SALE' AND date >= ${today} THEN amount ELSE 0 END), 0)::numeric as sales_today,
        COALESCE(SUM(CASE WHEN type = 'SALE' AND date >= ${startOfMonth} THEN amount ELSE 0 END), 0)::numeric as sales_month
      FROM transactions
      WHERE "deletedAt" IS NULL
    `;

    return {
      totalCustomers,
      customersWithDebt,
      totalDebt,
      paymentsToday: Number(periodStats[0]?.payments_today || 0),
      paymentsThisMonth: Number(periodStats[0]?.payments_month || 0),
      salesToday: Number(periodStats[0]?.sales_today || 0),
      salesThisMonth: Number(periodStats[0]?.sales_month || 0),
    };
  }

  static async getRecentActivity(limit = 20) {
    return prisma.activityLog.findMany({
      take: limit,
      orderBy: { createdAt: 'desc' },
      include: {
        user: { select: { fullName: true, username: true } }
      }
    });
  }
}
