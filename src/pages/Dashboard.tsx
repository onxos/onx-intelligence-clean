import { useState } from "react";
import { trpc } from "@/providers/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import {
  Brain,
  Activity,
  Shield,
  TrendingUp,
  Database,
  GitBranch,
  Send,
  ChevronRight,
  Zap,
  Lock,
  BarChart3,
  CircleDot,
  Sparkles,
} from "lucide-react";
import { useNavigate } from "react-router";

// ============================================================
// ONX INTELLIGENCE ADMIN DASHBOARD
// The Founder-facing interface for ONX Intelligence Runtime
// ============================================================

const STATE_COLORS: Record<string, string> = {
  RAW: "bg-gray-500",
  VALIDATING: "bg-yellow-500",
  VALIDATED: "bg-blue-500",
  LEARNING: "bg-indigo-500",
  PATTERN: "bg-purple-500",
  UNDERSTANDING: "bg-cyan-500",
  JUDGMENT: "bg-orange-500",
  WISDOM: "bg-amber-500",
  CAPITALIZED: "bg-green-500",
  CORRECTING: "bg-red-400",
  DECAYING: "bg-red-600",
  PRESERVED: "bg-emerald-600",
  REJECTED: "bg-red-800",
  DECAYED: "bg-gray-700",
  ARCHIVED: "bg-gray-400",
};

const TYPE_ICONS: Record<string, typeof Brain> = {
  SIGNAL: CircleDot,
  PATTERN: GitBranch,
  UNDERSTANDING: Brain,
  JUDGMENT: Shield,
  WISDOM: Zap,
  LESSON: TrendingUp,
};

export default function Dashboard() {
  const navigate = useNavigate();
  const [selectedObject, setSelectedObject] = useState<string | null>(null);
  const [intendForm, setIntendForm] = useState({
    content: "",
    objectType: "SIGNAL" as const,
    originSource: "L1_FOUNDER" as const,
    amanahScore: 0.75,
  });

  // tRPC queries
  const utils = trpc.useUtils();
  const stats = trpc.intelligence.stats.useQuery();
  const objects = trpc.intelligence.list.useQuery({ limit: 50 });
  const governance = trpc.intelligence.governance.useQuery();
  const continuity = trpc.intelligence.continuity.useQuery();
  const lineage = trpc.intelligence.lineage.useQuery(
    { objectId: selectedObject || "" },
    { enabled: !!selectedObject }
  );

  // tRPC mutations
  const intend = trpc.intelligence.intend.useMutation({
    onSuccess: () => {
      utils.intelligence.list.invalidate();
      utils.intelligence.stats.invalidate();
      setIntendForm({ content: "", objectType: "SIGNAL", originSource: "L1_FOUNDER", amanahScore: 0.75 });
    },
  });

  const learn = trpc.intelligence.learn.useMutation({
    onSuccess: () => {
      utils.intelligence.list.invalidate();
      utils.intelligence.stats.invalidate();
      utils.intelligence.lineage.invalidate();
    },
  });



  const exchange = trpc.intelligence.exchange.useMutation({
    onSuccess: () => utils.intelligence.stats.invalidate(),
  });

  const handleIntend = () => {
    if (!intendForm.content.trim()) return;
    intend.mutate({
      content: intendForm.content,
      objectType: intendForm.objectType,
      originSource: intendForm.originSource,
      amanahScore: intendForm.amanahScore,
    });
  };

  const handlePromote = (objectId: string) => {
    learn.mutate({ objectId, action: "PROMOTE", evidence: "Founder-authorized promotion" });
  };

  const handleValidate = (objectId: string) => {
    learn.mutate({ objectId, action: "VALIDATE" });
  };

  const handleMeasureObject = (_objectId: string) => {
    utils.intelligence.stats.invalidate();
  };

  const handleMeasureSystem = () => {
    utils.intelligence.stats.invalidate();
  };

  const handleExchange = (objectId: string) => {
    exchange.mutate({ objectId, producer: "Founder", consumer: "EliteVet", exchangeType: "DIRECT" });
  };

  const objectDetail = selectedObject
    ? objects.data?.find((o) => o.objectId === selectedObject)
    : null;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      {/* Header */}
      <header className="border-b border-slate-800 bg-slate-900/80 backdrop-blur">
        <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Brain className="w-7 h-7 text-emerald-400" />
            <div>
              <h1 className="text-xl font-bold tracking-tight">ONX Intelligence</h1>
              <p className="text-xs text-slate-400">Minimum Intelligence System — Phase 1 Runtime</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Button
              variant="outline"
              size="sm"
              className="border-indigo-500/50 text-indigo-400 hover:bg-indigo-950"
              onClick={() => navigate("/ask")}
            >
              <Sparkles className="w-4 h-4 mr-1" />
              Titan Bridge
            </Button>
            <Badge variant="outline" className="border-emerald-500/50 text-emerald-400">
              <Lock className="w-3 h-3 mr-1" />
              Amanah Floor: 0.50
            </Badge>
            <Badge variant="outline" className="border-blue-500/50 text-blue-400">
              <Shield className="w-3 h-3 mr-1" />
              FIC Active
            </Badge>
            <Badge variant="outline" className={stats.data?.systemHealth === "ACCUMULATING" ? "border-green-500/50 text-green-400" : stats.data?.systemHealth === "STABILIZING" ? "border-yellow-500/50 text-yellow-400" : "border-red-500/50 text-red-400"}>
              <Activity className="w-3 h-3 mr-1" />
              {stats.data?.systemHealth || "ACCUMULATING"}
            </Badge>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-6">
        {/* Stats Row */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <Card className="bg-slate-900 border-slate-800">
            <CardContent className="pt-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-slate-400">Intelligence Objects</p>
                  <p className="text-2xl font-bold">{stats.data?.objects.total || 0}</p>
                </div>
                <Database className="w-5 h-5 text-slate-500" />
              </div>
            </CardContent>
          </Card>
          <Card className="bg-slate-900 border-slate-800">
            <CardContent className="pt-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-slate-400">Capital Records</p>
                  <p className="text-2xl font-bold">{stats.data?.capital?.totalRecords || 0}</p>
                </div>
                <TrendingUp className="w-5 h-5 text-emerald-500" />
              </div>
            </CardContent>
          </Card>
          <Card className="bg-slate-900 border-slate-800">
            <CardContent className="pt-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-slate-400">ICI (Institutional Confidence)</p>
                  <p className="text-2xl font-bold">{(stats.data?.metrics.ICI || 0).toFixed(2)}</p>
                </div>
                <BarChart3 className="w-5 h-5 text-blue-500" />
              </div>
            </CardContent>
          </Card>
          <Card className="bg-slate-900 border-slate-800">
            <CardContent className="pt-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-slate-400">Governance Decisions</p>
                  <p className="text-2xl font-bold">{governance.data?.stats.totalObjects || 0}</p>
                </div>
                <Shield className="w-5 h-5 text-amber-500" />
              </div>
            </CardContent>
          </Card>
        </div>

        <Tabs defaultValue="feed" className="space-y-4">
          <TabsList className="bg-slate-900 border border-slate-800">
            <TabsTrigger value="feed" className="data-[state=active]:bg-slate-800">
              <Send className="w-4 h-4 mr-1" /> INTEND
            </TabsTrigger>
            <TabsTrigger value="objects" className="data-[state=active]:bg-slate-800">
              <Database className="w-4 h-4 mr-1" /> Objects
            </TabsTrigger>
            <TabsTrigger value="detail" className="data-[state=active]:bg-slate-800">
              <Brain className="w-4 h-4 mr-1" /> Detail
            </TabsTrigger>
            <TabsTrigger value="measure" className="data-[state=active]:bg-slate-800">
              <BarChart3 className="w-4 h-4 mr-1" /> Measure
            </TabsTrigger>
            <TabsTrigger value="governance" className="data-[state=active]:bg-slate-800">
              <Shield className="w-4 h-4 mr-1" /> Governance
            </TabsTrigger>
            <TabsTrigger value="continuity" className="data-[state=active]:bg-slate-800">
              <GitBranch className="w-4 h-4 mr-1" /> Continuity
            </TabsTrigger>
          </TabsList>

          {/* INTEND Tab */}
          <TabsContent value="feed">
            <Card className="bg-slate-900 border-slate-800">
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Send className="w-5 h-5 text-emerald-400" />
                  INTEND — Create Intelligence
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <Textarea
                  placeholder="Enter intelligence content... (Founder signal)"
                  value={intendForm.content}
                  onChange={(e) => setIntendForm({ ...intendForm, content: e.target.value })}
                  className="bg-slate-950 border-slate-700 min-h-[100px]"
                />
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="text-xs text-slate-400 mb-1 block">Object Type</label>
                    <Select
                      value={intendForm.objectType}
                      onValueChange={(v) => setIntendForm({ ...intendForm, objectType: v as typeof intendForm.objectType })}
                    >
                      <SelectTrigger className="bg-slate-950 border-slate-700">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="SIGNAL">SIGNAL</SelectItem>
                        <SelectItem value="PATTERN">PATTERN</SelectItem>
                        <SelectItem value="UNDERSTANDING">UNDERSTANDING</SelectItem>
                        <SelectItem value="JUDGMENT">JUDGMENT</SelectItem>
                        <SelectItem value="WISDOM">WISDOM</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <label className="text-xs text-slate-400 mb-1 block">Origin Source</label>
                    <Select
                      value={intendForm.originSource}
                      onValueChange={(v) => setIntendForm({ ...intendForm, originSource: v as typeof intendForm.originSource })}
                    >
                      <SelectTrigger className="bg-slate-950 border-slate-700">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="L1_FOUNDER">L1: Founder</SelectItem>
                        <SelectItem value="L2_SIL">L2: SIL</SelectItem>
                        <SelectItem value="L3_COMPANION">L3: Companion</SelectItem>
                        <SelectItem value="L5_REALITY">L5: Reality</SelectItem>
                        <SelectItem value="L7_EXTERNAL">L7: External</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <label className="text-xs text-slate-400 mb-1 block">Amanah Score</label>
                    <Input
                      type="number"
                      min={0}
                      max={1}
                      step={0.05}
                      value={intendForm.amanahScore}
                      onChange={(e) => setIntendForm({ ...intendForm, amanahScore: parseFloat(e.target.value) })}
                      className="bg-slate-950 border-slate-700"
                    />
                  </div>
                </div>
                <Button
                  onClick={handleIntend}
                  disabled={!intendForm.content.trim() || intend.isPending}
                  className="bg-emerald-600 hover:bg-emerald-700"
                >
                  <Send className="w-4 h-4 mr-2" />
                  {intend.isPending ? "Creating..." : "INTEND — Create Intelligence Object"}
                </Button>
                {intend.error && (
                  <div className="text-red-400 text-sm bg-red-950/50 p-3 rounded border border-red-800">
                    {intend.error.message}
                  </div>
                )}
                {intend.isSuccess && (
                  <div className="text-emerald-400 text-sm bg-emerald-950/50 p-3 rounded border border-emerald-800">
                    Object created: {intend.data.object.objectId} | OQI: {intend.data.metrics.OQI.toFixed(3)} | Amanah: {intend.data.governance.amanah}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Objects Tab */}
          <TabsContent value="objects">
            <Card className="bg-slate-900 border-slate-800">
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Database className="w-5 h-5 text-blue-400" />
                  Intelligence Objects ({objects.data?.length || 0})
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ScrollArea className="h-[500px]">
                  <div className="space-y-2">
                    {objects.data?.map((obj) => {
                      const Icon = TYPE_ICONS[obj.objectType] || CircleDot;
                      return (
                        <div
                          key={obj.id}
                          onClick={() => setSelectedObject(obj.objectId)}
                          className={`p-3 rounded-lg border cursor-pointer transition-colors ${
                            selectedObject === obj.objectId
                              ? "border-emerald-500/50 bg-emerald-950/20"
                              : "border-slate-800 bg-slate-950 hover:border-slate-700"
                          }`}
                        >
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                              <Icon className="w-4 h-4 text-slate-400" />
                              <div>
                                <div className="flex items-center gap-2">
                                  <span className="font-mono text-xs text-slate-500">{obj.objectId.slice(0, 8)}</span>
                                  <Badge className={`${STATE_COLORS[obj.lifecycleState] || "bg-gray-500"} text-white text-[10px]`}>
                                    {obj.lifecycleState}
                                  </Badge>
                                </div>
                                <p className="text-sm text-slate-300 mt-1 line-clamp-1">{obj.content}</p>
                              </div>
                            </div>
                            <div className="flex items-center gap-2">
                              <Badge variant="outline" className="text-[10px]">A:{obj.amanahScore}</Badge>
                              <Badge variant="outline" className="text-[10px]">R:{obj.understandingRung}</Badge>
                              <ChevronRight className="w-4 h-4 text-slate-600" />
                            </div>
                          </div>
                        </div>
                      );
                    })}
                    {(!objects.data || objects.data.length === 0) && (
                      <div className="text-center text-slate-500 py-10">No intelligence objects yet. Use INTEND to create the first.</div>
                    )}
                  </div>
                </ScrollArea>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Detail Tab */}
          <TabsContent value="detail">
            {objectDetail ? (
              <div className="space-y-4">
                <Card className="bg-slate-900 border-slate-800">
                  <CardHeader>
                    <CardTitle className="text-lg flex items-center gap-2">
                      <Brain className="w-5 h-5 text-purple-400" />
                      Object: {objectDetail.objectId.slice(0, 12)}...
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="grid grid-cols-4 gap-3 text-sm">
                      <div className="bg-slate-950 p-3 rounded border border-slate-800">
                        <p className="text-slate-400 text-xs">Type</p>
                        <p className="font-semibold">{objectDetail.objectType}</p>
                      </div>
                      <div className="bg-slate-950 p-3 rounded border border-slate-800">
                        <p className="text-slate-400 text-xs">State</p>
                        <Badge className={`${STATE_COLORS[objectDetail.lifecycleState]} text-white mt-1`}>
                          {objectDetail.lifecycleState}
                        </Badge>
                      </div>
                      <div className="bg-slate-950 p-3 rounded border border-slate-800">
                        <p className="text-slate-400 text-xs">Amanah</p>
                        <p className="font-semibold text-emerald-400">{objectDetail.amanahScore}</p>
                      </div>
                      <div className="bg-slate-950 p-3 rounded border border-slate-800">
                        <p className="text-slate-400 text-xs">Understanding Rung</p>
                        <p className="font-semibold">{objectDetail.understandingRung}/6</p>
                      </div>
                    </div>

                    <div className="bg-slate-950 p-4 rounded border border-slate-800">
                      <p className="text-slate-400 text-xs mb-1">Content</p>
                      <p className="text-sm">{objectDetail.content}</p>
                    </div>

                    {/* Actions */}
                    <div className="flex gap-2 flex-wrap">
                      <Button size="sm" onClick={() => handlePromote(objectDetail.objectId)} disabled={learn.isPending}>
                        <TrendingUp className="w-4 h-4 mr-1" /> PROMOTE
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => handleValidate(objectDetail.objectId)} disabled={learn.isPending}>
                        <Shield className="w-4 h-4 mr-1" /> VALIDATE
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => handleMeasureObject(objectDetail.objectId)}>
                        <BarChart3 className="w-4 h-4 mr-1" /> MEASURE
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => handleExchange(objectDetail.objectId)} disabled={exchange.isPending}>
                        <Send className="w-4 h-4 mr-1" /> EXCHANGE
                      </Button>
                    </div>
                  </CardContent>
                </Card>

                {/* Lineage */}
                {lineage.data && (
                  <Card className="bg-slate-900 border-slate-800">
                    <CardHeader>
                      <CardTitle className="text-lg flex items-center gap-2">
                        <GitBranch className="w-5 h-5 text-amber-400" />
                        Lineage (Depth: {lineage.data.depth})
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-2">
                        <h4 className="text-sm font-semibold text-slate-400">State Transitions</h4>
                        {lineage.data.transitions.map((t, i) => (
                          <div key={i} className="flex items-center gap-2 text-sm bg-slate-950 p-2 rounded">
                            <span className="text-slate-500">{t.fromState}</span>
                            <ChevronRight className="w-3 h-3 text-slate-600" />
                            <span className="text-emerald-400">{t.toState}</span>
                            <span className="text-slate-600 text-xs ml-2">{t.trigger}</span>
                          </div>
                        ))}
                        {lineage.data.transitions.length === 0 && (
                          <p className="text-slate-500 text-sm">No transitions yet. Use PROMOTE to advance.</p>
                        )}

                        {lineage.data.capital.length > 0 && (
                          <>
                            <Separator className="my-3" />
                            <h4 className="text-sm font-semibold text-slate-400">Capital Records</h4>
                            {lineage.data.capital.map((c, i) => (
                              <div key={i} className="flex items-center justify-between text-sm bg-slate-950 p-2 rounded">
                                <span className="text-emerald-400">{c.category}</span>
                                <span className="text-slate-300">+{c.amount}</span>
                                <span className="text-slate-500 text-xs">Balance: {c.balance}</span>
                              </div>
                            ))}
                          </>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                )}
              </div>
            ) : (
              <div className="text-center text-slate-500 py-20">Select an object from the Objects tab to view details.</div>
            )}
          </TabsContent>

          {/* Measure Tab */}
          <TabsContent value="measure">
            <Card className="bg-slate-900 border-slate-800">
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <BarChart3 className="w-5 h-5 text-blue-400" />
                  Quality Indices (D17)
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <Button onClick={() => handleMeasureSystem()}>
                  <Activity className="w-4 h-4 mr-2" />
                  Run System Measurement
                </Button>

                <div className="grid grid-cols-3 gap-3">
                  {[
                    { label: "UQI", value: stats.data?.metrics.UQI, desc: "Understanding Quality" },
                    { label: "JQI", value: stats.data?.metrics.JQI, desc: "Judgment Quality" },
                    { label: "WQI", value: stats.data?.metrics.WQI, desc: "Wisdom Quality" },
                    { label: "ICI", value: stats.data?.metrics.ICI, desc: "Institutional Confidence" },
                    { label: "OQI", value: stats.data?.metrics.OQI, desc: "Object Quality" },
                    { label: "IRS", value: stats.data?.metrics.IRS, desc: "Institutional Risk" },
                  ].map((m) => (
                    <div key={m.label} className="bg-slate-950 p-4 rounded border border-slate-800">
                      <p className="text-xs text-slate-400">{m.desc}</p>
                      <p className="text-2xl font-bold text-blue-400">{m.value !== undefined ? m.value.toFixed(3) : "—"}</p>
                      <p className="text-[10px] text-slate-500 font-mono">{m.label}</p>
                    </div>
                  ))}
                </div>

                {stats.data?.objects && (
                  <div className="bg-slate-950 p-4 rounded border border-slate-800">
                    <h4 className="text-sm font-semibold mb-2">State Distribution</h4>
                    <div className="flex flex-wrap gap-2">
                      {Object.entries(stats.data.objects.byState || {}).map(([state, count]) => (
                        <Badge key={state} className={`${STATE_COLORS[state] || "bg-gray-500"} text-white`}>
                          {state}: {count}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Governance Tab */}
          <TabsContent value="governance">
            <Card className="bg-slate-900 border-slate-800">
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Shield className="w-5 h-5 text-amber-400" />
                  Governance Status
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-5 gap-3">
                  {governance.data?.constitutionalStatus && Object.entries(governance.data.constitutionalStatus).map(([name, status]) => (
                    <div key={name} className="bg-slate-950 p-3 rounded border border-slate-800 text-center">
                      <p className="text-[10px] text-slate-400 uppercase">{name}</p>
                      <p className={`text-sm font-bold ${status === "ACTIVE" ? "text-emerald-400" : "text-red-400"}`}>{status}</p>
                    </div>
                  ))}
                </div>

                <Separator />

                <h4 className="text-sm font-semibold text-slate-400">Recent Decisions</h4>
                <ScrollArea className="h-[300px]">
                  <div className="space-y-2">
                    {governance.data?.decisions.map((d, i) => (
                      <div key={i} className="flex items-center justify-between text-sm bg-slate-950 p-3 rounded border border-slate-800">
                        <div>
                          <span className="text-slate-400">{d.decisionType}</span>
                          <p className="text-slate-500 text-xs">{d.rationale}</p>
                        </div>
                        <Badge className={d.outcome === "PASSED" ? "bg-emerald-600" : d.outcome === "BLOCKED" ? "bg-red-600" : "bg-yellow-600"}>
                          {d.outcome}
                        </Badge>
                      </div>
                    ))}
                    {(!governance.data?.decisions || governance.data.decisions.length === 0) && (
                      <p className="text-slate-500 text-center py-10">No governance decisions yet.</p>
                    )}
                  </div>
                </ScrollArea>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Continuity Tab */}
          <TabsContent value="continuity">
            <Card className="bg-slate-900 border-slate-800">
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <GitBranch className="w-5 h-5 text-purple-400" />
                  Continuity Engine (CCP-B)
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-3 gap-3">
                  <div className="bg-slate-950 p-3 rounded border border-slate-800 text-center">
                    <p className="text-xs text-slate-400">Total Records</p>
                    <p className="text-xl font-bold">{continuity.data?.totalRecords || 0}</p>
                  </div>
                  <div className="bg-slate-950 p-3 rounded border border-slate-800 text-center">
                    <p className="text-xs text-slate-400">Integrity</p>
                    <p className={`text-xl font-bold ${continuity.data?.integrity ? "text-emerald-400" : "text-red-400"}`}>
                      {continuity.data?.integrity ? "VERIFIED" : "COMPROMISED"}
                    </p>
                  </div>
                  <div className="bg-slate-950 p-3 rounded border border-slate-800 text-center">
                    <p className="text-xs text-slate-400">Hash Chain</p>
                    <p className="text-sm font-mono text-slate-300 truncate">
                      {continuity.data?.lastHash ? continuity.data.lastHash.slice(0, 16) + "..." : "N/A"}
                    </p>
                  </div>
                </div>

                <h4 className="text-sm font-semibold text-slate-400">Recent Continuity Records</h4>
                <ScrollArea className="h-[300px]">
                  <div className="space-y-2">
                    {continuity.data?.records.map((r, i) => (
                      <div key={i} className="text-sm bg-slate-950 p-3 rounded border border-slate-800 font-mono">
                        <div className="flex items-center justify-between">
                          <span className="text-slate-400">{r.eventType}</span>
                          <span className="text-slate-600 text-xs">{r.layer}</span>
                        </div>
                        <p className="text-slate-500 text-xs mt-1 truncate">Hash: {r.hash.slice(0, 24)}...</p>
                      </div>
                    ))}
                    {(!continuity.data?.records || continuity.data.records.length === 0) && (
                      <p className="text-slate-500 text-center py-10">No continuity records yet. Create an object to begin the chain.</p>
                    )}
                  </div>
                </ScrollArea>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}
