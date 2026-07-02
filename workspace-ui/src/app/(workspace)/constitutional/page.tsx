import { SechMonitor } from "@/components/constitutional/sech-monitor";
import { ConstraintMatrix } from "@/components/constitutional/constraint-matrix";
import { ViolationFeed } from "@/components/constitutional/violation-feed";
import { IurgGraph } from "@/components/constitutional/iurg-graph";

export default function ConstitutionalPage() {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-semibold text-slate-900">Constitutional Monitor</h1>
        <p className="text-sm text-slate-500">
          Live SECH gate posture, the constraint registry, and IURG-bound violations.
        </p>
      </div>

      <SechMonitor />

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-[minmax(0,1fr)_320px]">
        <ConstraintMatrix />
        <ViolationFeed />
      </div>

      <IurgGraph />
    </div>
  );
}
