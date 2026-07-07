import { trpc } from "@/providers/trpc"
import BackButton from '../components/BackButton'

const STATUS_STYLE: Record<string, string> = {
  GREEN: "text-green-400 border-green-700 bg-green-950/40",
  AMBER: "text-amber-400 border-amber-700 bg-amber-950/40",
  RED: "text-red-400 border-red-700 bg-red-950/40",
}

const CATEGORY_STYLE: Record<string, string> = {
  CORE: "text-cyan-300 border-cyan-800",
  CONSTRAINT: "text-amber-300 border-amber-800",
  SUPPORTING: "text-gray-300 border-gray-700",
}

function formatValue(value: number, unit: string): string {
  if (unit === "ratio") return `${(value * 100).toFixed(1)}%`
  if (unit === "capital") return value.toLocaleString(undefined, { maximumFractionDigits: 1 })
  if (unit === "rank") return value.toFixed(2)
  return value.toFixed(3)
}

function formatTarget(target: number, unit: string, direction: string): string {
  const arrow = direction === "min" ? "≥" : "≤"
  if (unit === "ratio") return `${arrow} ${(target * 100).toFixed(0)}%`
  return `${arrow} ${target}`
}

export default function IUCDashboard() {
  const snapshotQ = trpc.iuc.snapshot.useQuery()
  const typesQ = trpc.iuc.objectTypes.useQuery()
  const ladderQ = trpc.iuc.ladder.useQuery()
  const commitMut = trpc.iuc.commit.useMutation({
    onSuccess: () => { snapshotQ.refetch() },
  })

  const tuc = snapshotQ.data?.tuc ?? 0

  return (
    <div dir="rtl" className="min-h-screen bg-gray-950 text-white p-6">
      <BackButton />
      <div className="max-w-6xl mx-auto">
        <div className="mb-8 flex items-end justify-between flex-wrap gap-4">
          <div>
            <h1 className="text-3xl font-bold text-emerald-400">🧠 لوحة رأس مال الفهم (IUC)</h1>
            <p className="text-gray-400 mt-1">
              Intelligence Understanding Capital — 11 مؤشراً حياً فوق رسم الواقع IURG (I-M4)
            </p>
          </div>
          <button
            onClick={() => commitMut.mutate()}
            disabled={commitMut.isPending}
            className="bg-emerald-800 hover:bg-emerald-700 disabled:opacity-50 px-4 py-2 rounded-lg text-sm font-bold"
          >
            {commitMut.isPending ? "⏳ جارٍ..." : "📸 لقطة يومية"}
          </button>
        </div>

        {/* TUC headline */}
        <div className="bg-gradient-to-l from-emerald-950 to-gray-900 border border-emerald-700 rounded-2xl p-6 mb-6">
          <div className="text-gray-400 text-sm">رأس المال الكلي — TUC</div>
          <div className="text-5xl font-bold text-emerald-300 mt-1">
            {tuc.toLocaleString(undefined, { maximumFractionDigits: 1 })}
          </div>
          <div className="text-gray-500 text-xs mt-2">
            {snapshotQ.data
              ? `${snapshotQ.data.objectCount} كائناً · تعزيز ${snapshotQ.data.rewards} · جزاءات ${snapshotQ.data.penalties}`
              : "جارٍ التحميل..."}
          </div>
        </div>

        {/* 11 indicators */}
        {snapshotQ.data && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
            {snapshotQ.data.indicators.map((ind) => (
              <div
                key={ind.key}
                className={`rounded-xl p-4 border ${STATUS_STYLE[ind.status] ?? "border-gray-700"}`}
              >
                <div className="flex items-center justify-between">
                  <span className="font-bold text-sm">{ind.key}</span>
                  <span className="text-[10px] px-2 py-0.5 rounded-full border border-current">{ind.status}</span>
                </div>
                <div className="text-2xl font-bold mt-2">{formatValue(ind.value, ind.unit)}</div>
                <div className="text-gray-400 text-[11px] mt-1 leading-tight">{ind.label}</div>
                <div className="text-gray-500 text-[10px] mt-1">
                  الهدف {formatTarget(ind.target, ind.unit, ind.direction)}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* R1→R6 ladder */}
        {ladderQ.data && (
          <div className="bg-gray-900 border border-gray-700 rounded-xl p-6 mb-6">
            <h2 className="text-xl font-bold mb-4 text-purple-300">🪜 سلّم الفهم R1 → R6</h2>
            <div className="space-y-2">
              {ladderQ.data.ranks.map((r) => (
                <div key={r.from} className="flex items-center gap-3 text-sm bg-gray-800 rounded-lg p-3">
                  <span className="font-bold text-purple-400 w-20">{r.from} → {r.to}</span>
                  <span className="text-gray-300 flex-1">{r.name} — {r.threshold}</span>
                  <span className={`text-xs px-2 py-1 rounded ${r.human ? "bg-amber-900 text-amber-300" : "bg-green-900 text-green-300"}`}>
                    {r.gate}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 16 IURG object types */}
        {typesQ.data && (
          <div className="bg-gray-900 border border-gray-700 rounded-xl p-6">
            <h2 className="text-xl font-bold mb-4 text-cyan-300">
              🕸️ أنواع كائنات IURG الـ{typesQ.data.total}
            </h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
              {typesQ.data.types.map((t) => (
                <div
                  key={t.id}
                  className={`rounded-lg p-2 border text-center ${CATEGORY_STYLE[t.category] ?? "border-gray-700"}`}
                >
                  <div className="text-xs font-bold">{t.id}</div>
                  <div className="text-[10px] text-gray-500 mt-1">U={t.weight} · {t.category}</div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
