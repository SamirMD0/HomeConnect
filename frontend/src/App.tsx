import React from 'react';
import { HashRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from 'react-hot-toast';
import { AuthProvider } from './context/AuthContext';
import { ProtectedRoute } from './components/ProtectedRoute';
import { DashboardLayout } from './layouts/DashboardLayout';
import { Login } from './pages/Login';
import { Setup } from './pages/Setup';
import { CustomersListPage } from './pages/customers/CustomersListPage';
import { CustomerProfilePage } from './pages/customers/CustomerProfilePage';
import { DashboardPage } from './features/dashboard/pages/DashboardPage';
import { LedgerPage } from './pages/LedgerPage';
import { AccountsReceivablePage } from './pages/AccountsReceivablePage';
import { PrepaidPurchasesPage } from './pages/PrepaidPurchasesPage';
import { ReportsPage } from './pages/ReportsPage';
import { ReportDetailPage } from './pages/ReportDetailPage';
import { SettingsPage } from './pages/settings/SettingsPage';
import { ErrorBoundary } from './components/ErrorBoundary';
import { ServiceJobsPage } from './pages/service/ServiceJobsPage';
import { ServiceJobDetailsPage } from './pages/service/ServiceJobDetailsPage';
import { ProductLabelPage } from './pages/products/ProductLabelPage';
import { ProductsPage } from './pages/products/ProductsPage';
import { ScannerHubPage } from './pages/scanner/ScannerHubPage';
import { ProductLabelsPage } from './pages/products/ProductLabelsPage';
import { SuppliersPage } from './pages/suppliers/SuppliersPage';
import { SupplierProfilePage } from './pages/suppliers/SupplierProfilePage';
import { SupplierLedgerPage } from './pages/suppliers/SupplierLedgerPage';
import { PricingPresetsPage } from './pages/pricing/PricingPresetsPage';
import { SalesOrdersPage } from './pages/sales-orders/SalesOrdersPage';
import { SalesOrderDetailsPage } from './pages/sales-orders/SalesOrderDetailsPage';
import { InventoryPage } from './pages/inventory/InventoryPage';
import { SupplierReceivingListPage } from './features/inventory/receiving/pages/SupplierReceivingListPage';
import { NewSupplierReceivingPage } from './features/inventory/receiving/pages/NewSupplierReceivingPage';
import { SupplierReceivingDetailPage } from './features/inventory/receiving/pages/SupplierReceivingDetailPage';

const queryClient = new QueryClient();

const App: React.FC = () => {
  return (
    <QueryClientProvider client={queryClient}>
      <Toaster position="top-right" />
      <Router>
        <AuthProvider>
          <Routes>
            {/* Public/Auth Routes */}
            <Route path="/login" element={<Login />} />
            <Route path="/setup" element={<Setup />} />

            {/* Protected Dashboard Routes */}
            <Route 
              path="/" 
              element={
                <ProtectedRoute>
                  <ErrorBoundary>
                    <DashboardLayout />
                  </ErrorBoundary>
                </ProtectedRoute>
              }
            >
              <Route index element={<DashboardPage />} />
              <Route path="customers" element={<CustomersListPage />} />
              <Route path="customers/:id" element={<CustomerProfilePage />} />
              <Route path="ledger" element={<LedgerPage />} />
              <Route path="receivables" element={<AccountsReceivablePage />} />
              <Route path="prepaid" element={<PrepaidPurchasesPage />} />
              <Route path="service" element={<ServiceJobsPage />} />
              <Route path="service/:id" element={<ServiceJobDetailsPage />} />
              <Route path="sales-orders" element={<SalesOrdersPage />} />
              <Route path="sales-orders/:id" element={<SalesOrderDetailsPage />} />
              <Route path="products" element={<ProductsPage />} />
              <Route path="inventory" element={<InventoryPage />} />
              <Route path="inventory/receiving" element={<SupplierReceivingListPage />} />
              <Route path="inventory/receiving/new" element={<NewSupplierReceivingPage />} />
              <Route path="inventory/receiving/:receivingId" element={<SupplierReceivingDetailPage />} />
              <Route path="scanner" element={<ScannerHubPage />} />
              <Route path="pricing-presets" element={<PricingPresetsPage />} />
              <Route path="products/labels" element={<ProductLabelsPage />} />
              <Route path="products/:id/label" element={<ProductLabelPage />} />
              <Route path="suppliers" element={<SuppliersPage />} />
              <Route path="suppliers/:id" element={<SupplierProfilePage />} />
              <Route path="supplier-ledger" element={<SupplierLedgerPage />} />
              <Route path="reports" element={<ReportsPage />} />
              <Route path="reports/:reportId" element={<ReportDetailPage />} />
              <Route path="settings" element={<SettingsPage />} />
            </Route>
            
            {/* Fallback */}
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </AuthProvider>
      </Router>
    </QueryClientProvider>
  );
};

export default App;
