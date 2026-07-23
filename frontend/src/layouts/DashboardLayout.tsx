import React from 'react';
import { Outlet, useNavigate, Link, useLocation } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { LayoutDashboard, Users, LogOut, FileText, Menu, X, Settings, BookOpen } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

export const DashboardLayout: React.FC = () => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [sidebarOpen, setSidebarOpen] = React.useState(true);

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  const navItems = [
    { name: 'Dashboard', path: '/', icon: LayoutDashboard },
    { name: 'Customers', path: '/customers', icon: Users },
    { name: 'Ledger', path: '/ledger', icon: BookOpen },
    { name: 'Reports', path: '/reports', icon: FileText },
    ...(user?.role === 'ADMIN' ? [{ name: 'Settings', path: '/settings', icon: Settings }] : []),
  ];

  return (
    <div className="min-h-screen bg-slate-50 flex overflow-hidden font-sans text-slate-900">
      
      {/* Sidebar */}
      <AnimatePresence mode="wait">
        {sidebarOpen && (
          <motion.aside
            initial={{ width: 0, opacity: 0 }}
            animate={{ width: 280, opacity: 1 }}
            exit={{ width: 0, opacity: 0 }}
            className="bg-slate-900 text-white flex-shrink-0 flex flex-col shadow-2xl z-20 overflow-hidden"
          >
            <div className="h-16 flex items-center px-6 border-b border-slate-800">
              <div className="w-8 h-8 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-lg flex items-center justify-center mr-3 shadow-md">
                <span className="font-bold text-lg leading-none">H</span>
              </div>
              <span className="font-bold text-xl tracking-tight whitespace-nowrap">Home Connects</span>
            </div>

            <div className="flex-1 py-6 px-4 space-y-1 overflow-y-auto">
              <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-4 px-2">Menu</div>
              {navItems.map((item) => {
                const Icon = item.icon;
                const isActive = location.pathname === item.path || 
                                 (item.path !== '/' && location.pathname.startsWith(item.path));
                
                return (
                  <Link
                    key={item.name}
                    to={item.path}
                    className={`flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all ${
                      isActive 
                        ? 'bg-blue-600 text-white shadow-md shadow-blue-900/20 font-medium' 
                        : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200'
                    }`}
                  >
                    <Icon className={`w-5 h-5 ${isActive ? 'text-white' : 'text-slate-400'}`} />
                    <span className="whitespace-nowrap">{item.name}</span>
                  </Link>
                );
              })}
            </div>

            <div className="p-4 border-t border-slate-800">
              <div className="flex items-center gap-3 px-2 py-2">
                <div className="w-10 h-10 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center text-blue-400 font-bold uppercase shrink-0">
                  {user?.fullName.charAt(0)}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-white truncate">{user?.fullName}</p>
                  <p className="text-xs text-slate-400 truncate capitalize">{user?.role.toLowerCase()}</p>
                </div>
              </div>
              <button
                onClick={handleLogout}
                className="mt-4 w-full flex items-center justify-center gap-2 px-4 py-2 bg-slate-800/50 hover:bg-red-500/10 text-slate-300 hover:text-red-400 rounded-lg transition-colors border border-transparent hover:border-red-500/20 text-sm font-medium"
              >
                <LogOut className="w-4 h-4" />
                <span>Sign Out</span>
              </button>
            </div>
          </motion.aside>
        )}
      </AnimatePresence>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden relative">
        {/* Top Header */}
        <header className="h-16 bg-white border-b border-slate-200 flex items-center justify-between px-4 lg:px-8 shadow-sm z-10 shrink-0">
          <div className="flex items-center gap-4">
            <button
              onClick={() => setSidebarOpen(!sidebarOpen)}
              className="p-2 -ml-2 rounded-lg text-slate-500 hover:bg-slate-100 transition-colors"
            >
              {sidebarOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
            
            <h2 className="text-lg font-semibold text-slate-800 hidden sm:block">
              {navItems.find(item => item.path === location.pathname)?.name || 'Dashboard'}
            </h2>
          </div>
          
          <div className="flex items-center gap-4">
             {/* We can put global search or notifications here later */}
             <div className="text-sm font-medium text-slate-600 hidden sm:block">
               {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })}
             </div>
          </div>
        </header>

        {/* Page Content */}
        <main className="flex-1 overflow-y-auto p-4 lg:p-8 relative">
          <Outlet />
        </main>
      </div>
    </div>
  );
};
