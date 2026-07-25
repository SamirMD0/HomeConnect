import React from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { diagnosticsApi } from '../api/diagnostics.api';
import toast from 'react-hot-toast';
import { RefreshCw, Trash2, Copy, AlertCircle, Database, Server } from 'lucide-react';

export const DiagnosticsPanel: React.FC = () => {
  const queryClient = useQueryClient();

  const { data: health, isLoading: healthLoading, refetch: refetchHealth } = useQuery({
    queryKey: ['diagnostics-health'],
    queryFn: diagnosticsApi.getHealth,
    staleTime: 0,
  });

  const { data: errors, isLoading: errorsLoading, refetch: refetchErrors } = useQuery({
    queryKey: ['diagnostics-errors'],
    queryFn: () => diagnosticsApi.getErrors(20),
    staleTime: 0,
  });

  const clearErrorsMutation = useMutation({
    mutationFn: diagnosticsApi.clearErrors,
    onSuccess: () => {
      toast.success('Diagnostic logs cleared');
      queryClient.invalidateQueries({ queryKey: ['diagnostics-errors'] });
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.error?.message || 'Failed to clear logs');
    }
  });

  const handleRefresh = () => {
    refetchHealth();
    refetchErrors();
  };

  const handleCopyDiagnostics = () => {
    const diagnosticData = {
      health,
      recentErrors: errors,
    };
    navigator.clipboard.writeText(JSON.stringify(diagnosticData, null, 2))
      .then(() => toast.success('Diagnostics copied to clipboard'))
      .catch(() => toast.error('Failed to copy to clipboard'));
  };

  const handleClearLogs = () => {
    if (window.confirm('Are you sure you want to clear the local error logs? This cannot be undone.')) {
      clearErrorsMutation.mutate();
    }
  };

  const isLoading = healthLoading || errorsLoading;

  return (
    <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
      <div className="border-b border-slate-200 bg-slate-50 px-6 py-4 flex items-center justify-between">
        <div>
          <h2 className="text-lg font-medium text-slate-900">System Diagnostics</h2>
          <p className="mt-1 text-sm text-slate-500">
            View system health and local error logs.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleRefresh}
            disabled={isLoading}
            className="flex items-center gap-1.5 rounded-md bg-white px-3 py-1.5 text-sm font-medium text-slate-700 shadow-sm ring-1 ring-inset ring-slate-300 hover:bg-slate-50 disabled:opacity-50"
          >
            <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
          <button
            onClick={handleCopyDiagnostics}
            disabled={!health || isLoading}
            className="flex items-center gap-1.5 rounded-md bg-blue-600 px-3 py-1.5 text-sm font-medium text-white shadow-sm hover:bg-blue-500 disabled:opacity-50"
          >
            <Copy className="h-4 w-4" />
            Copy
          </button>
        </div>
      </div>

      <div className="p-6">
        {healthLoading ? (
          <div className="animate-pulse flex space-x-4 mb-6">
            <div className="h-20 bg-slate-200 rounded w-full"></div>
            <div className="h-20 bg-slate-200 rounded w-full"></div>
          </div>
        ) : health ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
            <div className="rounded-lg border border-slate-200 p-4">
              <div className="flex items-center gap-2 mb-2">
                <Server className="h-5 w-5 text-slate-500" />
                <h3 className="text-sm font-medium text-slate-900">Backend Status</h3>
              </div>
              <div className="mt-2 flex items-center gap-2">
                <span className={`inline-flex h-2.5 w-2.5 rounded-full ${health.status === 'healthy' ? 'bg-emerald-500' : 'bg-red-500'}`}></span>
                <span className="text-sm font-medium capitalize">{health.status}</span>
              </div>
              <p className="text-xs text-slate-500 mt-2">App Version: {health.appVersion}</p>
            </div>
            
            <div className="rounded-lg border border-slate-200 p-4">
              <div className="flex items-center gap-2 mb-2">
                <Database className="h-5 w-5 text-slate-500" />
                <h3 className="text-sm font-medium text-slate-900">Database</h3>
              </div>
              <div className="mt-2 flex items-center gap-2">
                <span className={`inline-flex h-2.5 w-2.5 rounded-full ${health.database === 'connected' ? 'bg-emerald-500' : 'bg-red-500'}`}></span>
                <span className="text-sm font-medium capitalize">{health.database}</span>
              </div>
            </div>

            <div className="col-span-1 md:col-span-2 rounded-lg border border-slate-200 p-4 bg-slate-50 text-xs">
              <span className="font-semibold text-slate-700">Log File Path:</span>
              <code className="ml-2 bg-white px-2 py-1 border border-slate-200 rounded text-slate-800 break-all">
                {health.logPath}
              </code>
            </div>
          </div>
        ) : (
          <div className="text-sm text-red-600 mb-8">Failed to load health data.</div>
        )}

        <div className="mt-4">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-base font-medium text-slate-900 flex items-center gap-2">
              <AlertCircle className="h-5 w-5 text-amber-500" />
              Latest Error Logs
            </h3>
            <button
              onClick={handleClearLogs}
              disabled={clearErrorsMutation.isPending || !errors || errors.length === 0}
              className="flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50 disabled:opacity-50"
            >
              <Trash2 className="h-4 w-4" />
              Clear Logs
            </button>
          </div>

          <div className="border border-slate-200 rounded-lg overflow-hidden">
            {errorsLoading ? (
              <div className="p-4 text-sm text-slate-500 text-center">Loading errors...</div>
            ) : errors && errors.length > 0 ? (
              <ul className="divide-y divide-slate-200 max-h-96 overflow-y-auto bg-slate-50">
                {errors.map((error, idx) => (
                  <li key={idx} className="p-4">
                    <div className="flex items-start justify-between">
                      <div className="font-mono text-xs font-semibold text-red-600 mb-1">
                        [{error.errorCode || 'ERROR'}] {error.method} {error.path}
                      </div>
                      <span className="text-xs text-slate-500 whitespace-nowrap ml-4">
                        {new Date(error.timestamp).toLocaleString()}
                      </span>
                    </div>
                    <div className="text-sm text-slate-800 mb-2 font-medium">{error.message}</div>
                    {error.stack && (
                      <pre className="text-xs text-slate-600 bg-slate-100 p-2 rounded overflow-x-auto whitespace-pre-wrap mt-2">
                        {error.stack}
                      </pre>
                    )}
                  </li>
                ))}
              </ul>
            ) : (
              <div className="p-8 text-center text-sm text-slate-500 bg-slate-50">
                No recent errors recorded.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
