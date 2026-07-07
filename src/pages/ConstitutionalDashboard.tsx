import { trpc } from '../lib/trpc'
import BackButton from '../components/BackButton'

export default function ConstitutionalDashboard() {
  const principlesQ = trpc.constitution.principles.useQuery()
  const guardianQ = trpc.constitution.guardianStatus?.useQuery?.() ?? { data: null }
  const statsQ = trpc.constitution.stats?.useQuery?.() ?? { data: null }
  const testMut = trpc.test.intelligence.useMutation()
  const civilMut = trpc.test.civilization.useMutation()
  const gherkinQ = trpc.test.gherkin.useQuery()
  const rateLimitQ = trpc.rateLimit.stats.useQuery()
  const budgetQ = trpc.budget.get.useQuery({ workspaceId: 'default' })
  const costQ = trpc.cost.realtime.useQuery()

  const PRINCIPLE_COLORS: Record<string, string> = {
    amanah: "text-yellow-400",
    adl: "text-blue-400",
    ihsan: "text-emerald-400",
    hikmah: "text-purple-400",
    rahmah: "text-pink-400",
    itqan: "text-cyan-400",
    tawakkul: "text-orange-400",
  }

  return (
    <div dir="rtl" className="min-h-screen bg-gray-950 text-white p-6">
      <BackButton />
      <div className="max-w-6xl mx-auto">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-amber-400">⚖️ لوحة الدستور</h1>
          <p className="text-gray-400 mt-1">Guardian الحارس الدستوري — المبادئ السبعة — قرارات الحكم</p>
        </div>

        {/* 7 Principles */}
        {principlesQ.data && (
          <div className="bg-gray-900 border border-amber-700 rounded-xl p-6 mb-6">
            <h2 className="text-xl font-bold mb-4 text-amber-300">📜 المبادئ الدستورية السبعة</h2>
            <div className="grid grid-cols-2 md:grid-cols-7 gap-3">
              {principlesQ.data.principles.map((p: any) => (
                <div key={p.key} className="bg-gray-800 rounded-xl p-3 text-center border border-gray-700">
                  <div className={`text-lg font-bold ${PRINCIPLE_COLORS[p.key] ?? "text-white"}`}>{p.ar}</div>
                  <div className="text-gray-400 text-xs mt-1">{p.name}</div>
                  <div className="text-gray-500 text-xs">{Math.round(p.weight * 100)}%</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* System Metrics */}
        <div className="grid md:grid-cols-3 gap-6 mb-6">
          {/* Rate Limiting */}
          {rateLimitQ.data && (
            <div className="bg-gray-900 border border-gray-700 rounded-xl p-5">
              <h3 className="font-bold text-cyan-300 mb-3">⚡ Rate Limiting</h3>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-400">الطلبات النشطة</span>
                  <span className="text-cyan-400">{rateLimitQ.data.totalRequests}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">Workspaces</span>
                  <span className="text-cyan-400">{rateLimitQ.data.totalWorkspaces}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">الحد الأقصى</span>
                  <span className="text-white">100 RPM</span>
                </div>
              </div>
            </div>
          )}

          {/* Budget */}
          {budgetQ.data && (
            <div className="bg-gray-900 border border-gray-700 rounded-xl p-5">
              <h3 className="font-bold text-emerald-300 mb-3">💰 الميزانية اليومية</h3>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-400">المنفق</span>
                  <span className="text-emerald-400">${budgetQ.data.spent}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">المتبقي</span>
                  <span className="text-green-400">${budgetQ.data.remaining}</span>
                </div>
                <div className="w-full bg-gray-700 rounded-full h-2 mt-2">
                  <div className="bg-emerald-500 h-2 rounded-full" style={{ width: `${budgetQ.data.percent}%` }} />
                </div>
                <div className="text-gray-500 text-xs text-center">{budgetQ.data.percent.toFixed(1)}% من $10</div>
              </div>
            </div>
          )}

          {/* Cost Dashboard */}
          {costQ.data && (
            <div className="bg-gray-900 border border-gray-700 rounded-xl p-5">
              <h3 className="font-bold text-purple-300 mb-3">📊 لوحة التكاليف</h3>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-400">إجمالي الطلبات</span>
                  <span className="text-purple-400">{costQ.data.totalCalls}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">إجمالي التكلفة</span>
                  <span className="text-white">${costQ.data.totalCost.toFixed(4)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">Tokens</span>
                  <span className="text-gray-300">{costQ.data.totalTokens.toLocaleString()}</span>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Flow Tests */}
        <div className="bg-gray-900 border border-gray-700 rounded-xl p-6 mb-6">
          <h2 className="text-xl font-bold mb-4 text-blue-300">🧪 اختبارات التدفق</h2>
          <div className="flex flex-wrap gap-3 mb-4">
            <button
              onClick={() => testMut.mutate()}
              disabled={testMut.isPending}
              className="bg-blue-800 hover:bg-blue-700 disabled:opacity-50 px-4 py-2 rounded-lg text-sm font-bold"
            >
              {testMut.isPending ? "⏳ جارٍ..." : "▶️ تدفق الذكاء"}
            </button>
            <button
              onClick={() => civilMut.mutate()}
              disabled={civilMut.isPending}
              className="bg-amber-800 hover:bg-amber-700 disabled:opacity-50 px-4 py-2 rounded-lg text-sm font-bold"
            >
              {civilMut.isPending ? "⏳ جارٍ..." : "▶️ تدفق الحضارة"}
            </button>
          </div>

          {testMut.data && (
            <div className="bg-gray-800 rounded-lg p-3 mb-2">
              <div className="text-sm font-bold text-blue-300">الذكاء: {testMut.data.passed}/{testMut.data.total} نجح</div>
              <div className="mt-1 space-y-1">
                {testMut.data.details.map((d) => (
                  <div key={d.name} className={`text-xs ${d.passed ? "text-green-400" : "text-red-400"}`}>
                    {d.passed ? "✅" : "❌"} {d.name}
                  </div>
                ))}
              </div>
            </div>
          )}

          {civilMut.data && (
            <div className="bg-gray-800 rounded-lg p-3">
              <div className="text-sm font-bold text-amber-300">الحضارة: {civilMut.data.passed}/{civilMut.data.total} نجح</div>
              <div className="mt-1 space-y-1">
                {civilMut.data.details.map((d) => (
                  <div key={d.name} className={`text-xs ${d.passed ? "text-green-400" : "text-red-400"}`}>
                    {d.passed ? "✅" : "❌"} {d.name}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Gherkin Scenarios */}
        {gherkinQ.data && (
          <div className="bg-gray-900 border border-gray-700 rounded-xl p-6">
            <h2 className="text-xl font-bold mb-4 text-green-300">📋 {gherkinQ.data.total} سيناريو Gherkin</h2>
            <div className="grid md:grid-cols-2 gap-1">
              {gherkinQ.data.scenarios.map((s, i) => (
                <div key={i} className="text-xs text-gray-400 py-1 border-b border-gray-800">
                  ✅ {s}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
