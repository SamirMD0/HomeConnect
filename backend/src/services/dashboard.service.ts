import { DashboardFinancialService } from '../features/dashboard/dashboard-financial.service';
import { scopeWhere, type BranchScope } from '../features/branches/branch-scope';
import { withBranchBreakdown } from '../features/branches/branch-breakdown';
import { prisma } from '../lib/prisma';

export class DashboardService {
  static getSummary(scope: BranchScope) { return withBranchBreakdown(scope, scoped => this.calculateSummary(scoped)); }
  private static async calculateSummary(scope: BranchScope) {
    // Compatibility adapter for the retired transactions-table dashboard.
    const current = await DashboardFinancialService.calculateGetFinancialSummary(scope);
    return {
      totalCustomers: current.counts.totalCustomers,
      customersWithDebt: current.counts.customersWithOutstanding,
      totalDebt: Number(current.money.totalOutstanding),
      paymentsToday: Number(current.money.paymentsToday),
      paymentsThisMonth: Number(current.money.paymentsThisMonth),
      salesToday: Number(current.money.obligationsCreatedToday),
      salesThisMonth: Number(current.money.obligationsCreatedThisMonth),
    };
  }

  static async getRecentActivity(scope: BranchScope, role: string, limit = 20) {
    return prisma.activityLog.findMany({
      where: { OR: [scopeWhere(scope), ...(role === 'ADMIN' ? [{branchId:null}] : [])] },
      take: limit,
      orderBy: { createdAt: 'desc' },
      include: {
        user: { select: { fullName: true, username: true } }
      }
    });
  }
}
