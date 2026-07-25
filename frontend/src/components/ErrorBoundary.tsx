import { Component, ErrorInfo, ReactNode } from 'react';
import { diagnosticsApi } from '../features/diagnostics/api/diagnostics.api';
import { AlertCircle, Copy, RefreshCw } from 'lucide-react';
import toast from 'react-hot-toast';

interface Props {
  children: ReactNode;
  fallbackRoute?: string;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
  timestamp: string;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
    errorInfo: null,
    timestamp: '',
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error, errorInfo: null, timestamp: new Date().toISOString() };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    const timestamp = new Date().toISOString();
    this.setState({ error, errorInfo, timestamp });

    // Report error to backend
    const route = window.location.pathname + window.location.hash;
    diagnosticsApi.reportError({
      route,
      message: error.message,
      stack: errorInfo.componentStack || error.stack,
      timestamp,
    }).catch(console.error);
  }

  private handleTryAgain = () => {
    this.setState({ hasError: false, error: null, errorInfo: null, timestamp: '' });
  };

  private handleCopyDiagnostics = () => {
    const { error, errorInfo, timestamp } = this.state;
    const diagnosticData = {
      type: 'FRONTEND_CRASH',
      route: window.location.pathname + window.location.hash,
      timestamp,
      message: error?.message,
      stack: errorInfo?.componentStack || error?.stack,
    };
    
    const text = JSON.stringify(diagnosticData, null, 2);
    
    if (window.electronAPI && window.electronAPI.copyDiagnostics) {
      window.electronAPI.copyDiagnostics(text).then(() => {
        toast.success('Diagnostics copied to clipboard');
      }).catch(() => {
        toast.error('Failed to copy diagnostics');
      });
    } else {
      navigator.clipboard.writeText(text)
        .then(() => toast.success('Diagnostics copied to clipboard'))
        .catch(() => toast.error('Failed to copy to clipboard'));
    }
  };

  public render() {
    if (this.state.hasError) {
      return (
        <div className="flex h-screen w-full flex-col items-center justify-center bg-slate-50 p-6">
          <div className="w-full max-w-lg rounded-xl border border-slate-200 bg-white p-8 shadow-sm">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-red-100">
              <AlertCircle className="h-6 w-6 text-red-600" />
            </div>
            
            <h1 className="mt-4 text-center text-xl font-semibold text-slate-900">
              Something went wrong
            </h1>
            
            <p className="mt-2 text-center text-sm text-slate-500">
              The application encountered an unexpected error on this page.
            </p>

            <div className="mt-6 rounded-md bg-slate-50 p-4 border border-slate-100">
              <p className="text-sm font-medium text-slate-900 truncate">
                {this.state.error?.message}
              </p>
              <p className="mt-1 text-xs text-slate-500">
                Route: {window.location.pathname + window.location.hash}
              </p>
            </div>

            <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:justify-center">
              <button
                onClick={this.handleTryAgain}
                className="flex items-center justify-center gap-2 rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-blue-500"
              >
                <RefreshCw className="h-4 w-4" />
                Try Again
              </button>
              <button
                onClick={this.handleCopyDiagnostics}
                className="flex items-center justify-center gap-2 rounded-md bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm ring-1 ring-inset ring-slate-300 hover:bg-slate-50"
              >
                <Copy className="h-4 w-4" />
                Copy Diagnostics
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
