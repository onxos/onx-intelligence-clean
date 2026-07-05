import { StatCard } from '../components/StatCard';
import { useKpi } from '../api/queries';
import { Users, Calendar, AlertTriangle, TrendingUp, Package, Bell } from 'lucide-react';

export function DashboardPage() {
  const { data: kpi, isLoading } = useKpi();
  if (isLoading) return <div className="text-gray-500">Loading...</div>;

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Dashboard</h1>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        <StatCard title="Total Patients" value={kpi?.totalPatients || 0} icon={Users} color="bg-blue-50 text-blue-600" />
        <StatCard title="Appointments Today" value={kpi?.totalAppointmentsToday || 0} icon={Calendar} color="bg-green-50 text-green-600" />
        <StatCard title="Overdue Invoices" value={kpi?.overdueInvoices || 0} subtitle="Requires attention" icon={AlertTriangle} color="bg-red-50 text-red-600" />
        <StatCard title="Revenue This Month" value={`$${(kpi?.totalRevenueThisMonth || 0).toLocaleString()}`} icon={TrendingUp} color="bg-emerald-50 text-emerald-600" />
        <StatCard title="Low Stock Items" value={kpi?.lowStockProducts || 0} subtitle="Below reorder level" icon={Package} color="bg-amber-50 text-amber-600" />
        <StatCard title="Unread Notifications" value={kpi?.unreadNotifications || 0} icon={Bell} color="bg-purple-50 text-purple-600" />
      </div>
    </div>
  );
}
