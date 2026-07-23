import React from 'react';
import { format } from 'date-fns';
import { ActivityLog } from '../types';

interface RecentActivityProps {
  logs: ActivityLog[];
  isLoading: boolean;
}

export const RecentActivity: React.FC<RecentActivityProps> = ({ logs, isLoading }) => {
  if (isLoading) {
    return (
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 h-full">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Recent Activity</h3>
        <div className="space-y-4 animate-pulse">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="flex gap-4">
              <div className="w-10 h-10 bg-gray-200 rounded-full" />
              <div className="flex-1 space-y-2 py-1">
                <div className="h-4 bg-gray-200 rounded w-3/4" />
                <div className="h-3 bg-gray-200 rounded w-1/4" />
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  const formatAction = (log: ActivityLog) => {
    const { action, details, user } = log;
    const author = <span className="font-medium text-gray-900">{user.fullName}</span>;

    if (action === 'TRANSACTION_CREATED') {
      const type = details.type === 'SALE' ? 'a sale' : details.type === 'PAYMENT' ? 'a payment' : 'an adjustment';
      return <>{author} recorded {type} of <span className="font-medium text-gray-900">${Number(details.amount).toFixed(2)}</span></>;
    }
    
    if (action === 'CUSTOMER_CREATED') {
      return <>{author} added a new customer</>;
    }

    return <>{author} performed {action}</>;
  };

  const getActionIcon = (action: string, details: any) => {
    if (action === 'TRANSACTION_CREATED') {
      if (details.type === 'SALE') {
        return (
          <div className="w-8 h-8 rounded-full bg-red-100 flex items-center justify-center text-red-600">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 17h8m0 0V9m0 8l-8-8-4 4-6-6" />
            </svg>
          </div>
        );
      }
      if (details.type === 'PAYMENT') {
        return (
          <div className="w-8 h-8 rounded-full bg-green-100 flex items-center justify-center text-green-600">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
            </svg>
          </div>
        );
      }
    }
    return (
      <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center text-blue-600">
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      </div>
    );
  };

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 h-full flex flex-col">
      <h3 className="text-lg font-semibold text-gray-900 mb-4">Recent Activity</h3>
      <div className="flex-1 overflow-y-auto pr-2 -mr-2 space-y-6">
        {logs.length === 0 ? (
          <p className="text-sm text-gray-500 text-center py-4">No recent activity.</p>
        ) : (
          <div className="relative border-l border-gray-200 ml-4 space-y-6">
            {logs.map((log) => (
              <div key={log.id} className="relative pl-6">
                <div className="absolute -left-4 top-0">
                  {getActionIcon(log.action, log.details)}
                </div>
                <div>
                  <p className="text-sm text-gray-600">{formatAction(log)}</p>
                  <p className="text-xs text-gray-400 mt-1">
                    {format(new Date(log.createdAt), 'MMM d, yyyy h:mm a')}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
