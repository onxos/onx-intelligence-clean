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
  const graphQ = trpc.iuc.graph.useQuery()
  const statsQ = trpc.iuc.stats.useQuery()
  const pendingQ = trpc.iuc.pending.useQuery()

  const refetchAll = () => {
    snapshotQ.refetch(); graphQ.refetch(); statsQ.refetch(); pendingQ.refetch()
  }

  const commitMut = trpc.iuc.commit.useMutation({ onSuccess: () => { snapshotQ.refetch() } })
  const applyMut = trpc.iuc.applyPromotion.useMutation({ onSuccess: refetchAll })
  const approveMut = trpc.iuc.approveGate.useMutation({ onSuccess: refetchAll })

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

        {/* Continuity + integrity strip */}
        {statsQ.data && (
          <div className="grid grid-cols-3 gap-3 mb-6">
            <div className="bg-gray-900 border border-gray-700 rounded-xl p-4 text-center">
              <div className="text-gray-400 text-xs">سلسلة الاستمرارية</div>
              <div className="text-2xl font-bold text-cyan-300 mt-1">{statsQ.data.chainLength}</div>
              <div className="text-[10px] text-gray-500">سجل مُجزَّأ (hash-chain)</div>
            </div>
            <div className={`rounded-xl p-4 text-center border ${statsQ.data.chainValid ? "border-green-700 bg-green-950/40" : "border-red-700 bg-red-950/40"}`}>
              <div className="text-gray-400 text-xs">سلامة السلسلة</div>
              <div className={`text-2xl font-bold mt-1 ${statsQ.data.chainValid ? "text-green-400" : "text-red-400"}`}>
                {statsQ.data.chainValid ? "✔ سليمة" : "✘ مكسورة"}
              </div>
              <div className="text-[10px] text-gray-500">تحقق SHA-256</div>
            </div>
            <div className="bg-gray-900 border border-gray-700 rounded-xl p-4 text-center">
              <div className="text-gray-400 text-xs">ترقيات معلّقة</div>
              <div className="text-2xl font-bold text-amber-300 mt-1">{statsQ.data.pendingCount}</div>
              <div className="text-[10px] text-gray-500">بوابات بشرية DG</div>
            </div>
          </div>
        )}

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

        {/* Pending human-gated promotions */}
        {pendingQ.data && pendingQ.data.length > 0 && (
          <div className="bg-amber-950/30 border border-amber-700 rounded-xl p-6 mb-6">
            <h2 className="text-xl font-bold mb-4 text-amber-300">🛂 ترقيات تنتظر اعتماداً بشرياً</h2>
            <div className="space-y-2">
              {pendingQ.data.map((p) => (
                <div key={p.objectId} className="flex items-center gap-3 bg-gray-900 rounded-lg p-3 text-sm">
                  <span className="font-bold text-amber-300 flex-1">{p.objectId}</span>
                  <span className="text-gray-400">R{p.fromRank} → R{p.toRank}</span>
                  <span className="text-xs px-2 py-1 rounded bg-amber-900 text-amber-300">{p.gate}</span>
                  <button
                    onClick={() => approveMut.mutate({ id: p.objectId, gate: p.gate, approver: "founder" })}
                    disabled={approveMut.isPending}
                    className="bg-green-800 hover:bg-green-700 disabled:opacity-50 px-3 py-1 rounded text-xs font-bold"
                  >
                    ✅ اعتماد
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Live IURG graph with promotion actions */}
        {graphQ.data && (
          <div className="bg-gray-900 border border-gray-700 rounded-xl p-6 mb-6">
            <h2 className="text-xl font-bold mb-4 text-emerald-300">🌐 الرسم البياني الحيّ ({graphQ.data.length})</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              {graphQ.data.map((n) => (
                <div key={n.id} className="flex items-center gap-2 bg-gray-800 rounded-lg p-3 text-sm">
                  <span className="font-bold text-gray-200 flex-1">{n.id}</span>
                  <span className="text-[11px] text-gray-500">{n.type}</span>
                  <span className="text-xs px-2 py-0.5 rounded bg-purple-900 text-purple-300">R{n.rank}</span>
                  <span className="text-[11px] text-gray-400">IUC {n.contribution}</span>
                  {n.rank < 6 && (
                    <button
                      onClick={() => applyMut.mutate({ id: n.id })}
                      disabled={applyMut.isPending}
                      className="bg-indigo-800 hover:bg-indigo-700 disabled:opacity-50 px-2 py-1 rounded text-xs"
                    >
                      ⬆ ترقية
                    </button>
                  )}
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
