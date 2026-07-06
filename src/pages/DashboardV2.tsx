import { useState } from "react";
import { Card, CardContent, CardHeader } from "../components/ui/card";
import { Badge } from "../components/ui/badge";
import { trpc } from "../lib/trpc";

const TABS = [
  { id: "overview", label: "نظرة عامة", icon: "📊" },
  { id: "constitution", label: "الدستور", icon: "📜" },
  { id: "titans", label: "العمالقة", icon: "👑" },
  { id: "skills", label: "المهارات", icon: "🛠️" },
  { id: "programs", label: "البرامج", icon: "🏛️" },
  { id: "knowledge", label: "المعارف", icon: "📚" },
];

export function DashboardV2() {
  const [activeTab, setActiveTab] = useState("overview");

  const health = trpc.health.ping.useQuery();
  const principles = trpc.constitution.principles.useQuery();
  const titans = trpc.titan.listTitans.useQuery();
  const skills = trpc.skills.list.useQuery();
  const knowledge = trpc.knowledge.stats.useQuery();
  const scheduler = trpc.scheduler.status.useQuery();

  const skillsByCategory = (skills.data ?? []).reduce((acc: Record<string, any[]>, s: any) => {
    acc[s.category] = acc[s.category] || [];
    acc[s.category].push(s);
    return acc;
  }, {});

  return (
    <div className="shell space-y-4" dir="rtl">
      <h2 className="text-2xl font-bold text-amber-900">Command Center / مركز القيادة</h2>

      <section className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
        <Card><CardContent className="p-3"><div className="text-2xl font-bold text-amber-800">36</div><div className="text-xs text-gray-600">tRPC Routers</div></CardContent></Card>
        <Card><CardContent className="p-3"><div className="text-2xl font-bold text-emerald-700">{principles.data?.length ?? 0}</div><div className="text-xs text-gray-600">مبادئ دستورية</div></CardContent></Card>
        <Card><CardContent className="p-3"><div className="text-2xl font-bold text-blue-700">{titans.data?.length ?? 0}</div><div className="text-xs text-gray-600">AI Titans</div></CardContent></Card>
        <Card><CardContent className="p-3"><div className="text-2xl font-bold text-purple-700">{skills.data?.length ?? 0}</div><div className="text-xs text-gray-600">مهارات</div></CardContent></Card>
      </section>

      <div className="flex flex-wrap gap-2 border-b border-amber-200 pb-2">
        {TABS.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`rounded-t-lg px-4 py-2 text-sm font-medium transition ${
              activeTab === tab.id ? "bg-amber-700 text-white" : "text-gray-600 hover:bg-amber-50"
            }`}
          >
            {tab.icon} {tab.label}
          </button>
        ))}
      </div>

      {activeTab === "overview" && (
        <div className="grid gap-4 md:grid-cols-2">
          <Card>
            <CardHeader>الحالة</CardHeader>
            <CardContent className="space-y-2">
              <div className="flex justify-between"><span>Health:</span><Badge>{health.data?.pong ? "✅ Online" : "⏳"}</Badge></div>
              <div className="flex justify-between"><span>Service:</span><span className="text-sm">{health.data?.service || "onx-v2"}</span></div>
              <div className="flex justify-between"><span>Scheduler:</span><Badge>{scheduler.data?.active ? "🟢 Active" : "🔴"}</Badge></div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>المعارف</CardHeader>
            <CardContent className="space-y-2">
              <div className="flex justify-between"><span>إجمالي السجلات:</span><span className="font-bold">{knowledge.data?.totalRecords?.toLocaleString() ?? 0}</span></div>
              <div className="flex justify-between"><span>المجالات:</span><span className="font-bold">{knowledge.data?.domains ?? 0}</span></div>
            </CardContent>
          </Card>
        </div>
      )}

      {activeTab === "constitution" && (
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
          {(principles.data ?? []).map((p: any) => (
            <Card key={p.key}>
              <CardHeader><div className="flex items-center gap-2"><span className="text-lg font-bold text-amber-900">{p.ar}</span><span className="text-xs text-gray-500">{p.name}</span></div></CardHeader>
              <CardContent><p className="text-sm text-gray-600">{p.description}</p></CardContent>
            </Card>
          ))}
        </div>
      )}

      {activeTab === "titans" && (
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
          {(titans.data ?? []).map((t: any) => (
            <Card key={t.id}>
              <CardHeader>
                <div className="flex items-center gap-2">
                  <div className={`h-8 w-8 rounded-full flex items-center justify-center text-white text-sm font-bold ${
                    t.id === "prometheus" ? "bg-amber-600" : t.id === "athena" ? "bg-blue-600" : t.id === "zeus" ? "bg-purple-600" : t.id === "hermes" ? "bg-emerald-600" : "bg-orange-600"
                  }`}>{t.name[0]}</div>
                  <div><div className="font-bold text-amber-900">{t.name}</div><div className="text-xs text-gray-500">{t.role}</div></div>
                </div>
              </CardHeader>
              <CardContent><Badge>Active</Badge></CardContent>
            </Card>
          ))}
        </div>
      )}

      {activeTab === "skills" && (
        <div className="space-y-4">
          {Object.entries(skillsByCategory).map(([category, items]: [string, any[]]) => (
            <Card key={category}>
              <CardHeader>{category} ({items.length} skills)</CardHeader>
              <CardContent><div className="flex flex-wrap gap-2">{items.map((s: any) => <Badge key={s.id}>{s.title}</Badge>)}</div></CardContent>
            </Card>
          ))}
        </div>
      )}

      {activeTab === "programs" && (
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
          {["CEP", "OCPP", "CEVP", "CCOP", "COS", "UCR"].map(code => (
            <Card key={code}>
              <CardHeader className="font-bold text-amber-900">{code}</CardHeader>
              <CardContent><p className="text-sm text-gray-600">برنامج حضاري فعال ضمن ONX Intelligence v2.0</p><Badge className="mt-2">Active</Badge></CardContent>
            </Card>
          ))}
        </div>
      )}

      {activeTab === "knowledge" && (
        <Card>
          <CardHeader>قاعدة المعارف</CardHeader>
          <CardContent className="space-y-3">
            <div className="flex justify-between"><span>السجلات:</span><span className="font-bold text-2xl text-amber-800">{knowledge.data?.totalRecords?.toLocaleString() ?? 0}</span></div>
            <div className="flex justify-between"><span>المجالات:</span><span className="font-bold">{knowledge.data?.domains ?? 0}</span></div>
            <div className="flex justify-between"><span>آخر تحديث:</span><span className="text-sm text-gray-500">{knowledge.data?.refreshedAt ? new Date(knowledge.data.refreshedAt).toLocaleDateString("ar-SA") : "—"}</span></div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
