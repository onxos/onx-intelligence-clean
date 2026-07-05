import type { LucideIcon } from 'lucide-react';

interface Props { title: string; value: string | number; subtitle?: string; icon: LucideIcon; color: string; }

export function StatCard({ title, value, subtitle, icon: Icon, color }: Props) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium text-gray-500">{title}</p>
          <p className="text-2xl font-bold text-gray-900 mt-1">{value}</p>
          {subtitle && <p className="text-xs text-gray-400 mt-1">{subtitle}</p>}
        </div>
        <div className={`p-3 rounded-lg ${color}`}><Icon size={24} /></div>
      </div>
    </div>
  );
}
