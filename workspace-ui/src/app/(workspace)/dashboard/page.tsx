import { KpiCards } from "@/components/dashboard/kpi-cards";
import { ActivityChart } from "@/components/dashboard/activity-chart";
import { RecentAlerts } from "@/components/dashboard/recent-alerts";
import { QuickActions } from "@/components/dashboard/quick-actions";

// TODO(activity): derive from /ai/logs aggregated by day once an aggregation
// endpoint exists; static 7-day series for now.
const ACTIVITY = [
  { label: "Mon", value: 142 },
  { label: "Tue", value: 168 },
  { label: "Wed", value: 155 },
  { label: "Thu", value: 201 },
  { label: "Fri", value: 187 },
  { label: "Sat", value: 96 },
  { label: "Sun", value: 124 },
];

export default function DashboardPage() {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-semibold text-slate-900">Command Center</h1>
        <p className="text-sm text-slate-500">
          Constitutional intelligence overview — queries, violations and live activity.
        </p>
      </div>

      <KpiCards />

      <ActivityChart title="Activity — last 7 days" points={ACTIVITY} />

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-[minmax(0,1fr)_320px]">
        <RecentAlerts />
        <QuickActions />
      </div>
    </div>
  );
}
