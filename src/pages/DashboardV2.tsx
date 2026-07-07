// ============================================================
// Dashboard v2 — Day 10: Central Command Center
// Real-time stats from all 28 routers
// ============================================================
import { trpc } from "@/providers/trpc";
import BackButton from "@/components/BackButton";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Activity, Brain, Shield, BookOpen, Bot, Sparkles,
  GitBranch, Zap, Clock,
  Server, Lock, Globe, Cpu, Layers,
} from "lucide-react";

function StatCard({ title, value, subtitle, icon, color }: { title: string; value: string | number; subtitle: string; icon: React.ReactNode; color: string }) {
  return (
    <Card className="border-gray-200 hover:shadow-md transition-shadow">
      <CardContent className="p-4">
        <div className="flex items-start justify-between">
          <div className="space-y-1">
            <p className="text-xs text-gray-500">{title}</p>
            <p className="text-2xl font-bold text-gray-900">{value}</p>
            <p className="text-[10px] text-gray-400">{subtitle}</p>
          </div>
          <div className={`p-2 rounded-lg ${color}`}>{icon}</div>
        </div>
      </CardContent>
    </Card>
  );
}

export default function DashboardV2() {
  // Fetch all stats in parallel
  const titanStats = trpc.titan.stats.useQuery();
  const constStats = trpc.constitution.stats.useQuery();
  const authStats = trpc.authHardening.stats.useQuery();
  const brainStats = trpc.aiBrain.stats.useQuery();
  const knowStats = trpc.knowledge.stats.useQuery();
  const skillStats = trpc.skills.stats.useQuery();
  const schedStats = trpc.scheduler.stats.useQuery();
  const ucrCert = trpc.ucr.certify.useQuery();

  return (
    <div className="min-h-screen bg-gray-50" dir="rtl">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="flex items-center justify-between max-w-7xl mx-auto">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-indigo-600 rounded-xl flex items-center justify-center">
              <Sparkles className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-gray-900">مركز القيادة</h1>
              <p className="text-xs text-gray-500">ONX Command Center — 28 Routers · 200+ Endpoints</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <BackButton href="/dashboard" label="رجوع" />
            <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200 gap-1">
              <Activity className="w-3 h-3" />
              System Online
            </Badge>
            {ucrCert.data?.certified && (
              <Badge className="bg-indigo-600 gap-1">
                <Shield className="w-3 h-3" />
                {ucrCert.data.certificate}
              </Badge>
            )}
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-6 py-6 space-y-6">
        {/* System Overview */}
        <section>
          <h2 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
            <Activity className="w-4 h-4 text-indigo-600" />
            نظرة عامة على النظام
          </h2>
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
            <StatCard title="Routers" value={28} subtitle="Active tRPC routers" icon={<Server className="w-4 h-4 text-blue-600" />} color="bg-blue-50" />
            <StatCard title="Endpoints" value="200+" subtitle="Total API endpoints" icon={<Zap className="w-4 h-4 text-amber-600" />} color="bg-amber-50" />
            <StatCard title="Engines" value={18} subtitle="Intelligence Runtime" icon={<Cpu className="w-4 h-4 text-purple-600" />} color="bg-purple-50" />
            <StatCard title="Skills" value={50} subtitle="Specialized capabilities" icon={<Layers className="w-4 h-4 text-emerald-600" />} color="bg-emerald-50" />
            <StatCard title="Domains" value={19} subtitle="Knowledge domains" icon={<Globe className="w-4 h-4 text-cyan-600" />} color="bg-cyan-50" />
            <StatCard title="Programs" value={6} subtitle="Civilizational programs" icon={<GitBranch className="w-4 h-4 text-rose-600" />} color="bg-rose-50" />
          </div>
        </section>

        {/* Real-time Stats Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Titan Bridge */}
          <Card className="border-gray-200">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <Bot className="w-4 h-4 text-indigo-600" />
                Titan Bridge
              </CardTitle>
            </CardHeader>
            <CardContent>
              {titanStats.data ? (
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between"><span className="text-gray-500">Total Calls</span><span className="font-semibold">{titanStats.data.totalCalls}</span></div>
                  <div className="flex justify-between"><span className="text-gray-500">Tokens Used</span><span className="font-semibold">{titanStats.data.totalTokens?.toLocaleString()}</span></div>
                  <div className="flex justify-between"><span className="text-gray-500">Active Sessions</span><span className="font-semibold">{titanStats.data.activeSessions}</span></div>
                  <div className="flex justify-between"><span className="text-gray-500">Titans</span><span className="font-semibold">{titanStats.data.titans}</span></div>
                  <div className="flex justify-between"><span className="text-gray-500">Provider</span><span className="font-semibold text-emerald-600">{titanStats.data.providers?.[0]?.name}</span></div>
                </div>
              ) : (
                <p className="text-sm text-gray-400">Loading...</p>
              )}
            </CardContent>
          </Card>

          {/* Constitution */}
          <Card className="border-gray-200">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <Shield className="w-4 h-4 text-emerald-600" />
                Constitutional Status
              </CardTitle>
            </CardHeader>
            <CardContent>
              {constStats.data ? (
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between"><span className="text-gray-500">Validations</span><span className="font-semibold">{constStats.data.totalValidations}</span></div>
                  <div className="flex justify-between"><span className="text-gray-500">Passed</span><span className="font-semibold text-emerald-600">{constStats.data.totalPassed}</span></div>
                  <div className="flex justify-between"><span className="text-gray-500">Pass Rate</span><span className="font-semibold">{constStats.data.passRate}%</span></div>
                  <div className="flex justify-between"><span className="text-gray-500">Principles</span><span className="font-semibold">7</span></div>
                  <div className="flex justify-between"><span className="text-gray-500">Amanah Floor</span><span className="font-semibold text-amber-600">0.50</span></div>
                </div>
              ) : (
                <p className="text-sm text-gray-400">Loading...</p>
              )}
            </CardContent>
          </Card>

          {/* AI Brain */}
          <Card className="border-gray-200">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <Brain className="w-4 h-4 text-purple-600" />
                AI Brain
              </CardTitle>
            </CardHeader>
            <CardContent>
              {brainStats.data ? (
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between"><span className="text-gray-500">Memories</span><span className="font-semibold">{brainStats.data.totalMemories}</span></div>
                  <div className="flex justify-between"><span className="text-gray-500">Retrievals</span><span className="font-semibold">{brainStats.data.totalRetrievals}</span></div>
                  <div className="flex justify-between"><span className="text-gray-500">Active Brains</span><span className="font-semibold">{brainStats.data.activeBrains}</span></div>
                  <div className="flex justify-between"><span className="text-gray-500">Avg Importance</span><span className="font-semibold">{brainStats.data.avgImportance}</span></div>
                  <div className="flex gap-1 mt-2">
                    {Object.entries(brainStats.data.memoryByLayer || {}).map(([layer, count]) => (
                      <Badge key={layer} variant="outline" className="text-[10px]">{layer}: {count}</Badge>
                    ))}
                  </div>
                </div>
              ) : (
                <p className="text-sm text-gray-400">Loading...</p>
              )}
            </CardContent>
          </Card>

          {/* Knowledge */}
          <Card className="border-gray-200">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <BookOpen className="w-4 h-4 text-cyan-600" />
                Knowledge Base
              </CardTitle>
            </CardHeader>
            <CardContent>
              {knowStats.data ? (
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between"><span className="text-gray-500">Records</span><span className="font-semibold">{knowStats.data.totalRecords?.toLocaleString()}</span></div>
                  <div className="flex justify-between"><span className="text-gray-500">Domains</span><span className="font-semibold">{knowStats.data.domains}</span></div>
                  <div className="flex justify-between"><span className="text-gray-500">Accesses</span><span className="font-semibold">{knowStats.data.totalAccesses?.toLocaleString()}</span></div>
                  <div className="flex justify-between"><span className="text-gray-500">Searches</span><span className="font-semibold">{knowStats.data.totalSearches}</span></div>
                  <div className="flex justify-between"><span className="text-gray-500">Confidence</span><span className="font-semibold">{knowStats.data.avgConfidence}</span></div>
                </div>
              ) : (
                <p className="text-sm text-gray-400">Loading...</p>
              )}
            </CardContent>
          </Card>

          {/* Scheduler */}
          <Card className="border-gray-200">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <Clock className="w-4 h-4 text-rose-600" />
                Consciousness Scheduler
              </CardTitle>
            </CardHeader>
            <CardContent>
              {schedStats.data ? (
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between"><span className="text-gray-500">Rhythms</span><span className="font-semibold">{schedStats.data.totalRhythms}</span></div>
                  <div className="flex justify-between"><span className="text-gray-500">Active</span><span className="font-semibold text-emerald-600">{schedStats.data.active}</span></div>
                  <div className="flex justify-between"><span className="text-gray-500">Healthy</span><span className="font-semibold text-emerald-600">{schedStats.data.healthy}</span></div>
                  <div className="flex justify-between"><span className="text-gray-500">Executions</span><span className="font-semibold">{schedStats.data.totalExecutions?.toLocaleString()}</span></div>
                  <div className="flex gap-1 mt-2">
                    {schedStats.data.rhythms?.map((r: any) => (
                      <Badge key={r.id} variant={r.active ? "default" : "outline"} className={`text-[10px] ${r.active ? "bg-emerald-600" : ""}`}>
                        {r.nameAr}
                      </Badge>
                    ))}
                  </div>
                </div>
              ) : (
                <p className="text-sm text-gray-400">Loading...</p>
              )}
            </CardContent>
          </Card>

          {/* Auth Security */}
          <Card className="border-gray-200">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <Lock className="w-4 h-4 text-amber-600" />
                Security
              </CardTitle>
            </CardHeader>
            <CardContent>
              {authStats.data ? (
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between"><span className="text-gray-500">Audit Entries</span><span className="font-semibold">{authStats.data.totalAuditEntries?.toLocaleString()}</span></div>
                  <div className="flex justify-between"><span className="text-gray-500">Allowed</span><span className="font-semibold text-emerald-600">{authStats.data.allowedCount}</span></div>
                  <div className="flex justify-between"><span className="text-gray-500">Denied</span><span className="font-semibold text-red-600">{authStats.data.deniedCount}</span></div>
                  <div className="flex justify-between"><span className="text-gray-500">Rate Limits</span><span className="font-semibold">{authStats.data.activeRateLimits}</span></div>
                  <div className="flex justify-between"><span className="text-gray-500">RBAC Roles</span><span className="font-semibold">5</span></div>
                </div>
              ) : (
                <p className="text-sm text-gray-400">Loading...</p>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Skills Overview */}
        {skillStats.data && (
          <section>
            <h2 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
              <Layers className="w-4 h-4 text-emerald-600" />
              المهارات المتخصصة (50 Skill)
            </h2>
            <div className="grid grid-cols-5 gap-3">
              {Object.entries(skillStats.data.byCategory || {}).map(([cat, count]: [string, any]) => (
                <Card key={cat} className="border-gray-200">
                  <CardContent className="p-3 text-center">
                    <p className="text-lg font-bold text-gray-900">{count}</p>
                    <p className="text-[10px] text-gray-500 capitalize">{cat}</p>
                  </CardContent>
                </Card>
              ))}
            </div>
          </section>
        )}

        {/* Footer */}
        <footer className="text-center text-xs text-gray-400 pt-6 pb-4">
          ONX Intelligence v1.0 — Civilization-Scale Intelligence Operating System
          <br />
          28 Routers · 200+ Endpoints · 18 Engines · 50 Skills · 19 Domains · 6 Programs · 5 Rhythms
        </footer>
      </div>
    </div>
  );
}
