import { Component, type ErrorInfo, type ReactNode } from 'react';

export class DashboardSectionBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch(error: Error, info: ErrorInfo) { console.error('Dashboard section failed', error, info); }
  render() {
    if (this.state.failed) return <div className="dashboard-state"><p>This section could not be displayed / تعذر عرض هذا القسم</p><button onClick={() => this.setState({ failed: false })}>Retry</button></div>;
    return this.props.children;
  }
}

