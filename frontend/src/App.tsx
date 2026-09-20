import React, { lazy, Suspense } from 'react';
import { HashRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from 'react-hot-toast';
import { AuthProvider } from './context/AuthContext';
import { ProtectedRoute } from './components/ProtectedRoute';
import { Login } from './pages/Login';
import { RolloutGuard } from './features/pricing-card/components/RolloutGuard';
import { ErrorBoundary } from './components/ErrorBoundary';

// Load business screens when visited so login does not wait for every report,
// chart, editor and print renderer to be transformed by the dev server.
const DashboardLayout = lazy(() =>
  import('./layouts/DashboardLayout').then((m) => ({ default: m.DashboardLayout }))
);
const Setup = lazy(() => import('./pages/Setup').then((m) => ({ default: m.Setup })));
const CustomersListPage = lazy(() =>
  import('./pages/customers/CustomersListPage').then((m) => ({ default: m.CustomersListPage }))
);
const CustomerProfilePage = lazy(() =>
  import('./pages/customers/CustomerProfilePage').then((m) => ({ default: m.CustomerProfilePage }))
);
const DashboardPage = lazy(() =>
  import('./features/dashboard/pages/DashboardPage').then((m) => ({ default: m.DashboardPage }))
);
const LedgerPage = lazy(() =>
  import('./pages/LedgerPage').then((m) => ({ default: m.LedgerPage }))
);
const AccountsReceivablePage = lazy(() =>
  import('./pages/AccountsReceivablePage').then((m) => ({ default: m.AccountsReceivablePage }))
);
const PrepaidPurchasesPage = lazy(() =>
  import('./pages/PrepaidPurchasesPage').then((m) => ({ default: m.PrepaidPurchasesPage }))
);
const ReportsPage = lazy(() =>
  import('./pages/ReportsPage').then((m) => ({ default: m.ReportsPage }))
);
const ReportDetailPage = lazy(() =>
  import('./pages/ReportDetailPage').then((m) => ({ default: m.ReportDetailPage }))
);
const SettingsPage = lazy(() =>
  import('./pages/settings/SettingsPage').then((m) => ({ default: m.SettingsPage }))
);
const ShopProfileSettingsPage = lazy(() =>
  import('./pages/settings/ShopProfileSettingsPage').then((m) => ({
    default: m.ShopProfileSettingsPage,
  }))
);
const FeatureIconsPage = lazy(() =>
  import('./pages/settings/FeatureIconsPage').then((m) => ({ default: m.FeatureIconsPage }))
);
const BrandLogosPage = lazy(() =>
  import('./pages/settings/BrandLogosPage').then((m) => ({ default: m.BrandLogosPage }))
);
const PricingCardTemplatesPage = lazy(() =>
  import('./pages/settings/PricingCardTemplatesPage').then((m) => ({
    default: m.PricingCardTemplatesPage,
  }))
);
const PricingCardTemplateEditorPage = lazy(() =>
  import('./pages/settings/PricingCardTemplateEditorPage').then((m) => ({
    default: m.PricingCardTemplateEditorPage,
  }))
);
const ServiceJobsPage = lazy(() =>
  import('./pages/service/ServiceJobsPage').then((m) => ({ default: m.ServiceJobsPage }))
);
const ServiceJobDetailsPage = lazy(() =>
  import('./pages/service/ServiceJobDetailsPage').then((m) => ({
    default: m.ServiceJobDetailsPage,
  }))
);
const ProductLabelPage = lazy(() =>
  import('./pages/products/ProductLabelPage').then((m) => ({ default: m.ProductLabelPage }))
);
const ProductsPage = lazy(() =>
  import('./pages/products/ProductsPage').then((m) => ({ default: m.ProductsPage }))
);
const BrandsPage = lazy(() =>
  import('./pages/products/BrandsPage').then((m) => ({ default: m.BrandsPage }))
);
const ScannerHubPage = lazy(() =>
  import('./pages/scanner/ScannerHubPage').then((m) => ({ default: m.ScannerHubPage }))
);
const ProductLabelsPage = lazy(() =>
  import('./pages/products/ProductLabelsPage').then((m) => ({ default: m.ProductLabelsPage }))
);
const ProductPricingCardPage = lazy(() =>
  import('./pages/products/ProductPricingCardPage').then((m) => ({
    default: m.ProductPricingCardPage,
  }))
);
const ProductPricingCardsPage = lazy(() =>
  import('./pages/products/ProductPricingCardsPage').then((m) => ({
    default: m.ProductPricingCardsPage,
  }))
);
const SuppliersPage = lazy(() =>
  import('./pages/suppliers/SuppliersPage').then((m) => ({ default: m.SuppliersPage }))
);
const SupplierProfilePage = lazy(() =>
  import('./pages/suppliers/SupplierProfilePage').then((m) => ({ default: m.SupplierProfilePage }))
);
const SupplierLedgerPage = lazy(() =>
  import('./pages/suppliers/SupplierLedgerPage').then((m) => ({ default: m.SupplierLedgerPage }))
);
const PricingPresetsPage = lazy(() =>
  import('./pages/pricing/PricingPresetsPage').then((m) => ({ default: m.PricingPresetsPage }))
);
const SalesOrdersPage = lazy(() =>
  import('./pages/sales-orders/SalesOrdersPage').then((m) => ({ default: m.SalesOrdersPage }))
);
const SalesOrderDetailsPage = lazy(() =>
  import('./pages/sales-orders/SalesOrderDetailsPage').then((m) => ({
    default: m.SalesOrderDetailsPage,
  }))
);
const InventoryPage = lazy(() =>
  import('./pages/inventory/InventoryPage').then((m) => ({ default: m.InventoryPage }))
);
const InventoryOnboardingPage = lazy(() =>
  import('./pages/inventory/InventoryOnboardingPage').then((m) => ({
    default: m.InventoryOnboardingPage,
  }))
);
const SupplierReceivingListPage = lazy(() =>
  import('./features/inventory/receiving/pages/SupplierReceivingListPage').then((m) => ({
    default: m.SupplierReceivingListPage,
  }))
);
const NewSupplierReceivingPage = lazy(() =>
  import('./features/inventory/receiving/pages/NewSupplierReceivingPage').then((m) => ({
    default: m.NewSupplierReceivingPage,
  }))
);
const SupplierReceivingDetailPage = lazy(() =>
  import('./features/inventory/receiving/pages/SupplierReceivingDetailPage').then((m) => ({
    default: m.SupplierReceivingDetailPage,
  }))
);

const queryClient = new QueryClient();

const App: React.FC = () => {
  return (
    <QueryClientProvider client={queryClient}>
      <Toaster position="top-right" />
      <Router>
        <AuthProvider>
          <ErrorBoundary>
            <Suspense
              fallback={
                <div
                  role="status"
                  className="min-h-screen flex items-center justify-center bg-slate-50 text-slate-600"
                >
                  Loading page…
                </div>
              }
            >
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
                  <Route path="products/brands" element={<BrandsPage />} />
                  <Route path="inventory" element={<InventoryPage />} />
                  <Route
                    path="inventory/onboarding"
                    element={
                      <ProtectedRoute allowedRoles={['ADMIN']}>
                        <InventoryOnboardingPage />
                      </ProtectedRoute>
                    }
                  />
                  <Route path="inventory/receiving" element={<SupplierReceivingListPage />} />
                  <Route path="inventory/receiving/new" element={<NewSupplierReceivingPage />} />
                  <Route
                    path="inventory/receiving/:receivingId"
                    element={<SupplierReceivingDetailPage />}
                  />
                  <Route path="scanner" element={<ScannerHubPage />} />
                  <Route path="pricing-presets" element={<PricingPresetsPage />} />
                  <Route
                    path="products/labels"
                    element={
                      <RolloutGuard
                        surface="legacy"
                        fallback={({ search }) => `/products/pricing-cards${search}`}
                      >
                        <ProductLabelsPage />
                      </RolloutGuard>
                    }
                  />
                  <Route
                    path="products/pricing-cards"
                    element={
                      <RolloutGuard
                        surface="pricing-card"
                        fallback={({ search }) => `/products/labels${search}`}
                      >
                        <ProductPricingCardsPage />
                      </RolloutGuard>
                    }
                  />
                  <Route
                    path="products/:id/label"
                    element={
                      <RolloutGuard
                        surface="legacy"
                        fallback={({ params }) => `/products/${params.id}/pricing-card`}
                      >
                        <ProductLabelPage />
                      </RolloutGuard>
                    }
                  />
                  <Route
                    path="products/:id/pricing-card"
                    element={
                      <RolloutGuard
                        surface="pricing-card"
                        fallback={({ params }) => `/products/${params.id}/label`}
                      >
                        <ProductPricingCardPage />
                      </RolloutGuard>
                    }
                  />
                  <Route path="suppliers" element={<SuppliersPage />} />
                  <Route path="suppliers/:id" element={<SupplierProfilePage />} />
                  <Route path="supplier-ledger" element={<SupplierLedgerPage />} />
                  <Route path="reports" element={<ReportsPage />} />
                  <Route path="reports/:reportId" element={<ReportDetailPage />} />
                  <Route path="settings" element={<SettingsPage />} />
                  <Route
                    path="settings/pricing-cards/shop-profile"
                    element={
                      <ProtectedRoute allowedRoles={['ADMIN']}>
                        <ShopProfileSettingsPage />
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="settings/pricing-cards/feature-icons"
                    element={
                      <ProtectedRoute allowedRoles={['ADMIN']}>
                        <FeatureIconsPage />
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="settings/pricing-cards/brand-logos"
                    element={
                      <ProtectedRoute allowedRoles={['ADMIN']}>
                        <BrandLogosPage />
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="settings/pricing-cards"
                    element={
                      <ProtectedRoute allowedRoles={['ADMIN']}>
                        <PricingCardTemplatesPage />
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="settings/pricing-cards/templates/:templateId"
                    element={
                      <ProtectedRoute allowedRoles={['ADMIN']}>
                        <PricingCardTemplateEditorPage />
                      </ProtectedRoute>
                    }
                  />
                </Route>

                {/* Fallback */}
                <Route path="*" element={<Navigate to="/" replace />} />
              </Routes>
            </Suspense>
          </ErrorBoundary>
        </AuthProvider>
      </Router>
    </QueryClientProvider>
  );
};

export default App;
