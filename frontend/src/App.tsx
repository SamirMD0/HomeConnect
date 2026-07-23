import React from 'react';
import { HashRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { ProtectedRoute } from './components/ProtectedRoute';
import { DashboardLayout } from './layouts/DashboardLayout';
import { Login } from './pages/Login';
import { Setup } from './pages/Setup';

// Temporary placeholder for dashboard content
const DashboardHome = () => (
  <div className="bg-white p-8 rounded-2xl shadow-sm border border-slate-200">
    <h1 className="text-2xl font-bold text-slate-800 mb-2">Welcome Back!</h1>
    <p className="text-slate-600">This is the main dashboard area. We will build out the customer and ledger widgets here in Phase 3.</p>
  </div>
);

const App: React.FC = () => {
  return (
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
            <Route index element={<DashboardHome />} />
            {/* We will add /customers, /reports, etc. here later */}
          </Route>
          
          {/* Fallback */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AuthProvider>
    </Router>
  );
};

export default App;
