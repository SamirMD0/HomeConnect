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
                <DashboardLayout />
              </ProtectedRoute>
            }
          >
            <Route index element={<DashboardPage />} />
            <Route path="customers" element={<CustomersListPage />} />
            <Route path="customers/:id" element={<CustomerProfilePage />} />
            <Route path="ledger" element={<LedgerPage />} />
            {/* We will add /reports, etc. here later */}
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
