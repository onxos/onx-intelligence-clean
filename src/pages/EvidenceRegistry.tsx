// ============================================================
// Evidence Registry — UEP Acceptance Criteria Dashboard
// 69 records tracking all P0/P1/P2/Milestones/Domains
// ============================================================
import { trpc } from "@/providers/trpc";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import { CheckCircle, XCircle, Clock, AlertTriangle, Shield, Zap } from "lucide-react";
import BackButton from "@/components/BackButton";
import { useState } from "react";

const CATEGORY_CONFIG = {
  P0_CRITICAL: { label: "P0 حرج", color: "bg-red-100 text-red-800 border-red-200", dot: "bg-red-500" },
  P1_HIGH: { label: "P1 عالي", color: "bg-orange-100 text-orange-800 border-orange-200", dot: "bg-orange-500" },
  P2_MEDIUM: { label: "P2 متوسط", color: "bg-yellow-100 text-yellow-800 border-yellow-200", dot: "bg-yellow-500" },
  MILESTONE: { label: "معلم", color: "bg-purple-100 text-purple-800 border-purple-200", dot: "bg-purple-500" },
  DOMAIN: { label: "مجال", color: "bg-blue-100 text-blue-800 border-blue-200", dot: "bg-blue-500" },
  LAYER: { label: "طبقة", color: "bg-indigo-100 text-indigo-800 border-indigo-200", dot: "bg-indigo-500" },
  LAUNCH: { label: "إطلاق", color: "bg-green-100 text-green-800 border-green-200", dot: "bg-green-500" },
};

const STATUS_CONFIG = {
  PENDING: { label: "معلّق", icon: <Clock className="w-3 h-3" />, color: "text-gray-500" },
  IN_PROGRESS: { label: "قيد التنفيذ", icon: <AlertTriangle className="w-3 h-3" />, color: "text-blue-600" },
  PASSED: { label: "ناجح ✓", icon: <CheckCircle className="w-3 h-3" />, color: "text-green-600" },
  FAILED: { label: "فاشل", icon: <XCircle className="w-3 h-3" />, color: "text-red-600" },
  WAIVED: { label: "مُعفى", icon: <Shield className="w-3 h-3" />, color: "text-gray-400" },
};

const LAYER_LABELS: Record<string, string> = {
  L0: "L0: الأساس", L1: "L1: المهارات", L2: "L2: المعرفة",
  L3: "L3: المجالات", L4: "L4: الاستقلالية", L5: "L5: التجريب",
};

export default function EvidenceRegistry() {
  const [filter, setFilter] = useState<string>("all");
  const allRecords = trpc.evidenceRegistry.getAll.useQuery({});
  const stats = trpc.evidenceRegistry.stats.useQuery();
  const seedMutation = trpc.evidenceRegistry.seed.useMutation();

  const records = allRecords.data || [];
  const filteredRecords = filter === "all" ? records : records.filter(r => r.category === filter || r.status === filter || r.layer === filter);

  const s = stats.data;

  return (
    <div className="min-h-screen bg-gray-50" dir="rtl">
      <header className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-indigo-600 rounded-xl flex items-center justify-center">
              <Shield className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-gray-900">سجل الأدلة — UEP</h1>
              <p className="text-xs text-gray-500">Evidence Registry · {s?.total || 69} سجل قبول · ONX Unified Execution Plan</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Badge className="bg-indigo-50 text-indigo-700 border-indigo-200 gap-1">
              <Zap className="w-3 h-3" /> {s?.completionRate || 0}% مكتمل
            </Badge>
            <button
              onClick={() => seedMutation.mutate()}
              className="px-3 py-1.5 text-xs bg-indigo-600 text-white rounded-md hover:bg-indigo-700"
            >
              {seedMutation.isPending ? "جاري..." : "بذر 69 سجل"}
            </button>
            <BackButton href="/dashboard" />
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 py-6 space-y-6">
        {/* Summary Cards */}
        {s && (
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
            <Card className="col-span-2 bg-gradient-to-br from-indigo-50 to-white">
              <CardContent className="p-4">
                <p className="text-xs text-gray-500 mb-1">النسبة الإجمالية</p>
                <p className="text-3xl font-bold text-indigo-700">{s.completionRate}%</p>
                <Progress value={s.completionRate} className="mt-2 h-2" />
                <p className="text-xs text-gray-500 mt-1">{s.passed}/{s.total} سجل مكتمل</p>
              </CardContent>
            </Card>
            <Card className="bg-red-50">
              <CardContent className="p-4">
                <p className="text-xs text-red-600 mb-1">P0 حرج</p>
                <p className="text-2xl font-bold text-red-700">{s.p0Passed}/{s.p0Total}</p>
                <Progress value={s.p0Rate} className="mt-2 h-1.5 bg-red-100" />
                <p className="text-xs text-red-400 mt-1">{s.p0Rate}%</p>
              </CardContent>
            </Card>
            {s.byLayer.map(l => (
              <Card key={l.layer} className="bg-white">
                <CardContent className="p-3">
                  <p className="text-xs text-gray-500 mb-1">{LAYER_LABELS[l.layer]}</p>
                  <p className="text-xl font-bold text-gray-800">{l.passed}/{l.total}</p>
                  <Progress value={l.total > 0 ? (l.passed / l.total) * 100 : 0} className="mt-1 h-1" />
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {/* Filters */}
        <div className="flex flex-wrap gap-2">
          {[
            { key: "all", label: "الكل" },
            { key: "P0_CRITICAL", label: "P0 حرج" },
            { key: "P1_HIGH", label: "P1 عالي" },
            { key: "MILESTONE", label: "معالم" },
            { key: "DOMAIN", label: "مجالات" },
            { key: "LAYER", label: "طبقات" },
            { key: "PASSED", label: "ناجح" },
            { key: "PENDING", label: "معلّق" },
          ].map(f => (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${filter === f.key ? "bg-indigo-600 text-white" : "bg-white text-gray-600 border border-gray-200 hover:bg-gray-50"}`}
            >
              {f.label}
            </button>
          ))}
          <span className="text-xs text-gray-400 self-center mr-auto">{filteredRecords.length} سجل</span>
        </div>

        {/* Records Table */}
        <Card>
          <ScrollArea className="h-[500px]">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 sticky top-0">
                <tr>
                  <th className="text-right px-4 py-2 text-xs font-medium text-gray-500">المعرّف</th>
                  <th className="text-right px-4 py-2 text-xs font-medium text-gray-500">الفئة</th>
                  <th className="text-right px-4 py-2 text-xs font-medium text-gray-500">العنوان</th>
                  <th className="text-right px-4 py-2 text-xs font-medium text-gray-500">الطبقة</th>
                  <th className="text-right px-4 py-2 text-xs font-medium text-gray-500">الحالة</th>
                  <th className="text-right px-4 py-2 text-xs font-medium text-gray-500">المؤسس</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filteredRecords.map(r => {
                  const cat = CATEGORY_CONFIG[r.category as keyof typeof CATEGORY_CONFIG];
                  const st = STATUS_CONFIG[r.status as keyof typeof STATUS_CONFIG];
                  return (
                    <tr key={r.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-4 py-2.5">
                        <code className="text-xs bg-gray-100 px-1.5 py-0.5 rounded font-mono">{r.evidenceId}</code>
                      </td>
                      <td className="px-4 py-2.5">
                        <span className={`text-xs px-2 py-0.5 rounded-full border ${cat?.color}`}>{cat?.label}</span>
                      </td>
                      <td className="px-4 py-2.5 max-w-xs">
                        <p className="text-sm font-medium text-gray-900 truncate">{r.title}</p>
                        <p className="text-xs text-gray-500 truncate">{r.description}</p>
                      </td>
                      <td className="px-4 py-2.5">
                        {r.layer && <Badge variant="outline" className="text-xs">{r.layer}</Badge>}
                      </td>
                      <td className="px-4 py-2.5">
                        <span className={`flex items-center gap-1 text-xs ${st?.color}`}>
                          {st?.icon} {st?.label}
                        </span>
                      </td>
                      <td className="px-4 py-2.5">
                        {r.founderSigned ? <CheckCircle className="w-4 h-4 text-green-500" /> : <Clock className="w-4 h-4 text-gray-300" />}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </ScrollArea>
        </Card>
      </div>
    </div>
  );
}
