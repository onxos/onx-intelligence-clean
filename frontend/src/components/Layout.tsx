import { Link, useLocation } from 'react-router-dom';
import { useAuthStore } from '../stores/authStore';
import {
  LayoutDashboard, Users, Calendar, FileText, Pill,
  FlaskConical, CreditCard, Package, Settings, LogOut,
} from 'lucide-react';

const navItems = [
  { path: '/', label: 'Dashboard', icon: LayoutDashboard },
  { path: '/patients', label: 'Patients', icon: Users },
  { path: '/appointments', label: 'Appointments', icon: Calendar },
  { path: '/medical-records', label: 'Medical Records', icon: FileText },
  { path: '/prescriptions', label: 'Prescriptions', icon: Pill },
  { path: '/lab-results', label: 'Lab Results', icon: FlaskConical },
  { path: '/billing', label: 'Billing', icon: CreditCard },
  { path: '/inventory', label: 'Inventory', icon: Package },
  { path: '/settings', label: 'Settings', icon: Settings },
];

export function Layout({ children }: { children: React.ReactNode }) {
  const location = useLocation();
  const logout = useAuthStore((s) => s.logout);

  return (
    <div className="flex h-screen bg-gray-100">
      <aside className="w-64 bg-white border-r border-gray-200 flex flex-col">
        <div className="p-6 border-b border-gray-200">
          <h1 className="text-xl font-bold text-onx-700">ONX Intelligence</h1>
          <p className="text-xs text-gray-500 mt-1">Veterinary Clinic</p>
        </div>
        <nav className="flex-1 p-4 space-y-1">
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = location.pathname === item.path;
            return (
              <Link key={item.path} to={item.path}
                className={`flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm font-medium transition-colors ${active ? 'bg-onx-50 text-onx-700' : 'text-gray-600 hover:bg-gray-50'}`}>
                <Icon size={18} />
                {item.label}
              </Link>
            );
          })}
        </nav>
        <div className="p-4 border-t border-gray-200">
          <button onClick={logout}
            className="flex items-center gap-3 px-4 py-2.5 text-sm font-medium text-red-600 hover:bg-red-50 rounded-lg w-full">
            <LogOut size={18} /> Sign Out
          </button>
        </div>
      </aside>
      <main className="flex-1 overflow-auto p-8">{children}</main>
    </div>
  );
}
