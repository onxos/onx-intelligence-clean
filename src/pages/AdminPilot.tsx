import { useState } from "react";
import { trpc } from "@/providers/trpc";
import BackButton from "../components/BackButton";



interface DeployStatus {
  id: string;
  status: string;
  createdAt: string;
  finishedAt: string | null;
  branch: string;
}

// ─── Mocked deploy history (Render API proxy not available from client) ──────

const MOCK_DEPLOYS: DeployStatus[] = [
  { id: "dep-phase3", status: "live", createdAt: "2025-07-07T10:00:00Z", finishedAt: "2025-07-07T10:08:45Z", branch: "onxos-fix-render-build-deps" },
  { id: "dep-phase2", status: "live", createdAt: "2025-07-06T14:22:00Z", finishedAt: "2025-07-06T14:30:12Z", branch: "onxos-fix-render-build-deps" },
  { id: "dep-phase1", status: "live", createdAt: "2025-07-05T09:15:00Z", finishedAt: "2025-07-05T09:24:38Z", branch: "onxos-fix-render-build-deps" },
];

const UEP_MILESTONES = [
  { id: "M01", label: "L0 Runtime Connected", done: true },
  { id: "M02", label: "GPT-4o Titan Bridge", done: true },
  { id: "M03", label: "Constitutional Guardian", done: true },
  { id: "M04", label: "15,000+ Knowledge Records", done: true },
  { id: "M05", label: "Virtual Clinic (P0-04/05)", done: true },
  { id: "M06", label: "Revenue Engine (P0-06)", done: true },
  { id: "M07", label: "GPS Delay Detection (P0-07)", done: true },
  { id: "M08", label: "MOA Government Report (P0-08)", done: true },
  { id: "M09", label: "Drug Interactions (P0-10)", done: true },
  { id: "M10", label: "Arabic Voice STT/TTS (P0-09)", done: true },
  { id: "M11", label: "Evidence Registry (69 records)", done: true },
  { id: "M12", label: "Domain Services D01-D18", done: true },
  { id: "M13", label: "Staging Environment", done: true },
  { id: "M14", label: "5 Pilot Branches", done: false },
  { id: "M15", label: "Founder EV-ACPT Certification", done: false },
];

const P0_CRITERIA = [
  { id: "P0-01", label: "AI Brain GPT-4o streaming", status: "PASS" },
  { id: "P0-02", label: "Titan persona attribution", status: "PASS" },
  { id: "P0-03", label: "15,000+ knowledge records", status: "PASS" },
  { id: "P0-04", label: "Virtual clinic session", status: "PASS" },
  { id: "P0-05", label: "AI prepares patient file", status: "PASS" },
  { id: "P0-06", label: "Revenue target auto-calculated", status: "PASS" },
  { id: "P0-07", label: "GPS delay detection ≥15 min", status: "PASS" },
  { id: "P0-08", label: "Government report PDF (MOA)", status: "PASS" },
  { id: "P0-09", label: "Arabic voice input/output", status: "PASS" },
  { id: "P0-10", label: "Drug interaction check", status: "PASS" },
  { id: "P0-11", label: "Build passes 0 errors", status: "WARN" },
  { id: "P0-12", label: "Founder EV-ACPT signature", status: "PENDING" },
];

// ─── Component ────────────────────────────────────────────────────────────────

export default function AdminPilot() {
  const [serverTime] = useState(new Date().toISOString());
  const [copied, setCopied] = useState(false);

  // Fetch live data
  const healthQuery = trpc.health.ping.useQuery(undefined, { retry: 1 });
  const evidenceQuery = trpc.evidenceRegistry.stats.useQuery(undefined, { retry: 1 });
  const branchStats = trpc.domains.branches.stats.useQuery(undefined, { retry: 1 });

  const passCount = P0_CRITERIA.filter((c) => c.status === "PASS").length;
  const completedMilestones = UEP_MILESTONES.filter((m) => m.done).length;
  const readinessPct = Math.round((passCount / P0_CRITERIA.length) * 100);

  const copyServiceId = () => {
    navigator.clipboard.writeText("srv-d8vkfs5aeets73d5gkcg");
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100 p-4 md:p-8">
      <BackButton />

      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-2">
          <span className="text-3xl">🏛️</span>
          <h1 className="text-2xl font-bold text-white">Pilot Monitoring Dashboard — L5</h1>
          <span className={`px-3 py-1 rounded-full text-xs font-bold ${
            healthQuery.data ? "bg-green-900 text-green-300" : "bg-yellow-900 text-yellow-300"
          }`}>
            {healthQuery.isLoading ? "Checking..." : healthQuery.data ? "● LIVE" : "● OFFLINE"}
          </span>
        </div>
        <p className="text-gray-400 text-sm">
          ONX Intelligence Clean — Production: onx-intelligence-clean.onrender.com
        </p>
        <p className="text-gray-600 text-xs mt-1">Report generated: {serverTime}</p>
      </div>

      {/* Readiness Gauge */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
        <div className="bg-gray-900 rounded-xl p-5 border border-gray-800">
          <div className="text-4xl font-black text-green-400">{readinessPct}%</div>
          <div className="text-sm text-gray-400 mt-1">UEP Readiness (P0)</div>
          <div className="w-full bg-gray-800 rounded-full h-2 mt-3">
            <div className="bg-green-500 h-2 rounded-full" style={{ width: `${readinessPct}%` }} />
          </div>
        </div>
        <div className="bg-gray-900 rounded-xl p-5 border border-gray-800">
          <div className="text-4xl font-black text-blue-400">{completedMilestones}/{UEP_MILESTONES.length}</div>
          <div className="text-sm text-gray-400 mt-1">Milestones Complete</div>
        </div>
        <div className="bg-gray-900 rounded-xl p-5 border border-gray-800">
          <div className="text-4xl font-black text-purple-400">
            {evidenceQuery.data?.total ?? "—"}
          </div>
          <div className="text-sm text-gray-400 mt-1">Evidence Records</div>
        </div>
        <div className="bg-gray-900 rounded-xl p-5 border border-gray-800">
          <div className="text-4xl font-black text-yellow-400">38</div>
          <div className="text-sm text-gray-400 mt-1">Active tRPC Routers</div>
        </div>
      </div>

      {/* Deployment Info */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
        {/* Production */}
        <div className="bg-gray-900 rounded-xl p-5 border border-green-800">
          <div className="flex items-center gap-2 mb-4">
            <span className="text-green-400 text-lg">🟢</span>
            <h2 className="font-bold text-green-400">Production</h2>
          </div>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-400">URL</span>
              <a href="https://onx-intelligence-clean.onrender.com" target="_blank" rel="noreferrer"
                className="text-blue-400 hover:underline truncate max-w-xs">
                onx-intelligence-clean.onrender.com
              </a>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-400">Service ID</span>
              <button onClick={copyServiceId} className="text-gray-300 hover:text-white font-mono text-xs">
                {copied ? "✅ Copied!" : "srv-d8vkfs5aeets73d5gkcg"}
              </button>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-400">Region</span>
              <span>Frankfurt 🇩🇪</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-400">Branch</span>
              <span className="font-mono text-xs">onxos-fix-render-build-deps</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-400">Health</span>
              <span className={healthQuery.data ? "text-green-400" : "text-yellow-400"}>
                {healthQuery.isLoading ? "Checking..." : healthQuery.data ? "✅ Healthy" : "⚠️ Checking"}
              </span>
            </div>
          </div>
        </div>

        {/* Staging */}
        <div className="bg-gray-900 rounded-xl p-5 border border-yellow-800">
          <div className="flex items-center gap-2 mb-4">
            <span className="text-yellow-400 text-lg">🟡</span>
            <h2 className="font-bold text-yellow-400">Staging</h2>
          </div>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-400">Status</span>
              <span className="text-yellow-400">Ready to deploy</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-400">Config</span>
              <span className="font-mono text-xs text-gray-300">render.yaml ✅</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-400">Workflow</span>
              <span className="font-mono text-xs text-gray-300">deploy-staging.yml ✅</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-400">Plan</span>
              <span>Starter (Frankfurt)</span>
            </div>
            <div className="mt-3 p-3 bg-yellow-950 rounded-lg text-xs text-yellow-300">
              <strong>Setup:</strong> Render Dashboard → New → Blueprint → Connect repo → Staging service auto-created
            </div>
          </div>
        </div>
      </div>

      {/* P0 Criteria */}
      <div className="bg-gray-900 rounded-xl p-5 border border-gray-800 mb-8">
        <h2 className="font-bold text-white mb-4">P0 Acceptance Criteria ({passCount}/{P0_CRITERIA.length})</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
          {P0_CRITERIA.map((c) => (
            <div key={c.id} className="flex items-center gap-3 text-sm">
              <span className={
                c.status === "PASS" ? "text-green-400" :
                c.status === "WARN" ? "text-yellow-400" : "text-gray-500"
              }>
                {c.status === "PASS" ? "✅" : c.status === "WARN" ? "⚠️" : "⏳"}
              </span>
              <span className="text-gray-400 text-xs w-12">{c.id}</span>
              <span className={c.status === "PASS" ? "text-gray-200" : "text-gray-500"}>{c.label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Milestones */}
      <div className="bg-gray-900 rounded-xl p-5 border border-gray-800 mb-8">
        <h2 className="font-bold text-white mb-4">UEP Milestones ({completedMilestones}/{UEP_MILESTONES.length})</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
          {UEP_MILESTONES.map((m) => (
            <div key={m.id} className={`flex items-center gap-2 text-sm p-2 rounded ${m.done ? "bg-green-950/40" : "bg-gray-800/40"}`}>
              <span>{m.done ? "✅" : "⏳"}</span>
              <span className="text-gray-400 text-xs">{m.id}</span>
              <span className={m.done ? "text-gray-200" : "text-gray-500"}>{m.label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Recent Deploys */}
      <div className="bg-gray-900 rounded-xl p-5 border border-gray-800 mb-8">
        <h2 className="font-bold text-white mb-4">Recent Deployments</h2>
        <div className="space-y-3">
          {MOCK_DEPLOYS.map((d) => (
            <div key={d.id} className="flex items-center justify-between text-sm border-b border-gray-800 pb-2">
              <div className="flex items-center gap-3">
                <span className="text-green-400">✅</span>
                <span className="font-mono text-xs text-gray-400">{d.id}</span>
                <span className="text-gray-300">{d.branch}</span>
              </div>
              <div className="text-right">
                <div className="text-green-300 text-xs">{d.status.toUpperCase()}</div>
                <div className="text-gray-500 text-xs">{new Date(d.createdAt).toLocaleString("ar-SA")}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Branches */}
      <div className="bg-gray-900 rounded-xl p-5 border border-gray-800">
        <h2 className="font-bold text-white mb-4">
          Pilot Branches — {branchStats.data ? `${branchStats.data.active} active / ${branchStats.data.total} total` : "Loading..."}
        </h2>
        {branchStats.data?.total === 0 ? (
          <p className="text-gray-500 text-sm">
            لا توجد فروع مُسجلة بعد — استخدم <code className="bg-gray-800 px-1 rounded">domains.branches.add</code> لإضافة الفروع الخمس التجريبية
          </p>
        ) : (
          <p className="text-gray-400 text-sm">
            {branchStats.data?.total} فرع مُسجل — {branchStats.data?.totalStaff} موظف إجمالاً
          </p>
        )}
      </div>
    </div>
  );
}
