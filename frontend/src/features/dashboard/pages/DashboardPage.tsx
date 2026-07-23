import React from 'react';
import { useDashboardSummary, useRecentActivity } from '../hooks/useDashboard';
import { StatCard } from '../components/StatCard';
import { RecentActivity } from '../components/RecentActivity';
import { QuickActions } from '../components/QuickActions';

export const DashboardPage: React.FC = () => {
  const { data: summary, isLoading: isLoadingSummary } = useDashboardSummary();
  const { data: recentActivity, isLoading: isLoadingActivity } = useRecentActivity();

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-end">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
          <p className="mt-1 text-sm text-gray-500">
            Overview of your business's financial position and recent activity.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatCard
          title="Total Outstanding Debt"
          value={isLoadingSummary ? '...' : `$${summary?.totalDebt.toFixed(2)}`}
          color="danger"
          icon={
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          }
        />
        <StatCard
          title="Customers in Debt"
          value={isLoadingSummary ? '...' : summary?.customersWithDebt || 0}
          color="warning"
          icon={
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
            </svg>
          }
        />
        <StatCard
          title="Payments This Month"
          value={isLoadingSummary ? '...' : `$${summary?.paymentsThisMonth.toFixed(2)}`}
          color="success"
          icon={
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          }
        />
        <StatCard
          title="Total Customers"
          value={isLoadingSummary ? '...' : summary?.totalCustomers || 0}
          color="info"
          icon={
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
            </svg>
          }
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 h-[500px]">
          <RecentActivity logs={recentActivity || []} isLoading={isLoadingActivity} />
        </div>
        <div className="space-y-6">
          <QuickActions />
          
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Today's Summary</h3>
            <div className="space-y-4">
              <div className="flex justify-between items-center py-2 border-b border-gray-50">
                <span className="text-gray-500">Sales (New Debt)</span>
                <span className="font-semibold text-gray-900">
                  {isLoadingSummary ? '...' : `$${summary?.salesToday.toFixed(2)}`}
                </span>
              </div>
              <div className="flex justify-between items-center py-2 border-b border-gray-50">
                <span className="text-gray-500">Payments Received</span>
                <span className="font-semibold text-green-600">
                  {isLoadingSummary ? '...' : `$${summary?.paymentsToday.toFixed(2)}`}
                </span>
              </div>
              <div className="flex justify-between items-center py-2 pt-4">
                <span className="text-gray-700 font-medium">Net Change</span>
                <span className={`font-bold ${
                  !summary ? '' : summary.salesToday - summary.paymentsToday > 0 ? 'text-red-600' : 'text-green-600'
                }`}>
                  {isLoadingSummary || !summary ? '...' : `${summary.salesToday - summary.paymentsToday > 0 ? '+' : ''}${(summary.salesToday - summary.paymentsToday).toFixed(2)}`}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
