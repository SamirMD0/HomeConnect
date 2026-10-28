import { describe, expect, it, vi } from 'vitest';
const { calculate } = vi.hoisted(() => ({calculate:vi.fn()}));
vi.mock('../features/dashboard/dashboard-financial.service',()=>({DashboardFinancialService:{calculateGetFinancialSummary:calculate}}));
import { DashboardService } from './dashboard.service';

describe('legacy dashboard current-ledger adapter',()=>{
  it('keeps the seven legacy response fields and number types using the scoped current-ledger calculation',async()=>{
    const scope={mode:'single' as const,branchIds:['aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa']};
    calculate.mockResolvedValue({counts:{totalCustomers:2,customersWithOutstanding:1},money:{totalOutstanding:'12.34',paymentsToday:'1.00',paymentsThisMonth:'2.00',obligationsCreatedToday:'3.00',obligationsCreatedThisMonth:'4.00'}});
    expect(await DashboardService.getSummary(scope)).toEqual({totalCustomers:2,customersWithDebt:1,totalDebt:12.34,paymentsToday:1,paymentsThisMonth:2,salesToday:3,salesThisMonth:4});
    expect(calculate).toHaveBeenCalledExactlyOnceWith(scope);
  });
});
