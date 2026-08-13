import React from 'react';
import { Outlet, useNavigate, Link, useLocation } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { LayoutDashboard, Users, LogOut, FileText, Menu, X, Settings, BookOpen, Wallet, Wrench, Package, Truck, Landmark, HandCoins, Calculator, ScanLine, ShoppingCart, Warehouse } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { LocalStatusIndicator } from '../features/system/components/LocalStatusIndicator';

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
    { name: 'Customers / الزبائن', path: '/customers', icon: Users },
    { name: 'Ledger / دفتر الحسابات', path: '/ledger', icon: BookOpen },
    { name: 'Receivables / الذمم', path: '/receivables', icon: Wallet },
    { name: 'Prepaid / المدفوع مسبقاً', path: '/prepaid', icon: HandCoins },
    { name: 'Sales Orders / طلبات البيع', path: '/sales-orders', icon: ShoppingCart },
    { name: 'Service / الصيانة', path: '/service', icon: Wrench },
    { name: 'Products / المنتجات', path: '/products', icon: Package },
    { name: 'Inventory / المخزون', path: '/inventory', icon: Warehouse },
    { name: 'Scanner Hub / مركز المسح', path: '/scanner', icon: ScanLine },
    { name: 'Pricing Presets / صيغ التسعير', path: '/pricing-presets', icon: Calculator },
    { name: 'Suppliers / المورّدون', path: '/suppliers', icon: Truck },
    { name: 'Supplier Ledger / حسابات المورّدين', path: '/supplier-ledger', icon: Landmark },
    { name: 'Reports / التقارير', path: '/reports', icon: FileText },
    ...(user?.role === 'ADMIN' ? [{ name: 'Settings / الإعدادات', path: '/settings', icon: Settings }] : []),
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
            className="bg-blue-950 text-white flex-shrink-0 flex flex-col shadow-2xl z-20 overflow-hidden"
          >
            <div className="h-16 flex items-center px-6 border-b border-blue-900/70">
              <img
                src="/homeconnects-logo.webp"
                alt="Home Connects"
                className="mr-3 h-9 w-9 rounded-md bg-white object-contain p-1 shadow-md"
              />
              <span className="font-bold text-xl tracking-tight whitespace-nowrap">Home Connects</span>
            </div>

            <div className="flex-1 py-6 px-4 space-y-1 overflow-y-auto">
              <div className="text-xs font-semibold text-blue-300/70 uppercase tracking-wider mb-4 px-2">Menu</div>
              {navItems.map((item) => {
                const Icon = item.icon;
                const isActive = location.pathname === item.path || 
                                 (item.path !== '/' && location.pathname.startsWith(item.path));
                
                return (
                  <Link
                    key={item.name}
                    to={item.path}
                    className={`flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all text-sm ${
                      isActive 
                        ? 'bg-sky-600 text-white shadow-md shadow-sky-950/30 font-medium'
                        : 'text-blue-100/75 hover:bg-blue-900/70 hover:text-white'
                    }`}
                    title={item.name}
                  >
                    <Icon className={`h-5 w-5 shrink-0 ${isActive ? 'text-white' : 'text-blue-200/75'}`} />
                    <span className="min-w-0 flex-1 truncate leading-tight">{item.name}</span>
                  </Link>
                );
              })}
            </div>

            <div className="p-4 border-t border-blue-900/70">
              <div className="flex items-center gap-3 px-2 py-2">
                <div className="w-10 h-10 rounded-full bg-blue-900 border border-blue-800 flex items-center justify-center text-sky-300 font-bold uppercase shrink-0">
                  {user?.fullName.charAt(0)}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-white truncate">{user?.fullName}</p>
                  <p className="text-xs text-blue-200/70 truncate capitalize">{user?.role.toLowerCase()}</p>
                </div>
              </div>
              <button
                onClick={handleLogout}
                className="mt-4 w-full flex items-center justify-center gap-2 px-4 py-2 bg-blue-900/50 hover:bg-red-500/10 text-blue-100/80 hover:text-red-300 rounded-lg transition-colors border border-transparent hover:border-red-400/30 text-sm font-medium"
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
          
          <div className="hidden items-center gap-2 sm:flex">
            <LocalStatusIndicator />
            <span className="text-sm font-medium text-slate-600">
              {new Date().toLocaleDateString('en-GB', {
                weekday: 'long',
                day: 'numeric',
                month: 'short',
                year: 'numeric',
              })}
            </span>
            <span className="rounded-md border border-slate-200 bg-slate-50 px-2 py-0.5 text-[11px] font-semibold tabular-nums text-slate-500">
              v{__APP_VERSION__}
            </span>
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
