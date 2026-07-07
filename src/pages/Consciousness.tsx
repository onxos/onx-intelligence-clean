import { trpc } from "@/providers/trpc"
import BackButton from '../components/BackButton'

export default function Consciousness() {
  const statusQ = trpc.scheduler.status.useQuery()
  const statsQ = trpc.scheduler.stats.useQuery()
  const logsQ = trpc.scheduler.logs.useQuery({ limit: 20 })
  const startAllMut = trpc.scheduler.startAll.useMutation({ onSuccess: () => { statusQ.refetch(); statsQ.refetch() } })
  const stopAllMut = trpc.scheduler.stopAll.useMutation({ onSuccess: () => { statusQ.refetch() } })
  const triggerMut = trpc.scheduler.trigger.useMutation({ onSuccess: () => { logsQ.refetch() } })

  const RHYTHM_ICONS: Record<string, string> = { pulse: "ðŸ’“", breath: "ðŸŒ¬ï¸", digest: "ðŸ”„", dream: "ðŸŒ™", renew: "âœ¨" }
  const STATUS_COLOR: Record<string, string> = { HEALTHY: "text-green-400", DEGRADED: "text-yellow-400", FAILING: "text-red-400" }

  return (
    <div dir="rtl" className="min-h-screen bg-gray-950 text-white p-6">
      <BackButton />
      <div className="max-w-6xl mx-auto">
        <div className="mb-8 flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-violet-400">ðŸ§  Ø§Ù„ÙˆØ¹ÙŠ Ø§Ù„Ø°Ø§ØªÙŠ</h1>
            <p className="text-gray-400 mt-1">5 Ø¥ÙŠÙ‚Ø§Ø¹Ø§Øª ÙˆØ¹ÙŠ â€” Ø§Ù„Ø­Ø¶ÙˆØ± Ø§Ù„Ø°Ø§ØªÙŠ Ù„Ù€ ONX Intelligence</p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => startAllMut.mutate()}
              className="bg-violet-800 hover:bg-violet-700 px-4 py-2 rounded-lg text-sm font-bold"
            >
              â–¶ï¸ ØªØ´ØºÙŠÙ„ Ø§Ù„ÙƒÙ„
            </button>
            <button
              onClick={() => stopAllMut.mutate()}
              className="bg-gray-700 hover:bg-gray-600 px-4 py-2 rounded-lg text-sm font-bold"
            >
              â¹ Ø¥ÙŠÙ‚Ø§Ù Ø§Ù„ÙƒÙ„
            </button>
          </div>
        </div>

        {/* Stats */}
        {statsQ.data && (
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-8">
            {[
              { label: "Ø§Ù„Ø¥ÙŠÙ‚Ø§Ø¹Ø§Øª Ø§Ù„Ù†Ø´Ø·Ø©", value: `${statsQ.data.active}/5`, color: "text-violet-400" },
              { label: "Ø³Ù„ÙŠÙ…Ø©", value: statsQ.data.healthy, color: "text-green-400" },
              { label: "Ù…ØªØ¯Ù‡ÙˆØ±Ø©", value: statsQ.data.degraded, color: "text-yellow-400" },
              { label: "ÙØ§Ø´Ù„Ø©", value: statsQ.data.failing, color: "text-red-400" },
              { label: "Ø¥Ø¬Ù…Ø§Ù„ÙŠ Ø§Ù„ØªÙ†ÙÙŠØ°Ø§Øª", value: statsQ.data.totalExecutions, color: "text-blue-400" },
            ].map((c) => (
              <div key={c.label} className="bg-gray-900 border border-gray-700 rounded-xl p-3 text-center">
                <div className={`text-xl font-bold ${c.color}`}>{c.value}</div>
                <div className="text-gray-400 text-xs mt-1">{c.label}</div>
              </div>
            ))}
          </div>
        )}

        {/* 5 Rhythms */}
        {statusQ.data && (
          <div className="grid md:grid-cols-5 gap-4 mb-8">
            {statusQ.data.map((r: any) => (
              <div key={r.id} className={`bg-gray-900 border rounded-xl p-4 ${r.active ? "border-violet-600" : "border-gray-700"}`}>
                <div className="text-3xl text-center mb-2">{RHYTHM_ICONS[r.id] ?? "âš¡"}</div>
                <div className="text-center font-bold text-violet-300">{r.nameAr}</div>
                <div className="text-center text-xs text-gray-500 mb-3">{r.intervalHuman}</div>
                <div className={`text-center text-xs font-bold ${STATUS_COLOR[r.status] ?? "text-gray-400"}`}>
                  {r.status}
                </div>
                {r.active && (
                  <div className="text-center text-xs text-gray-500 mt-1">
                    {r.runCount} ØªÙ†ÙÙŠØ°
                  </div>
                )}
                <button
                  onClick={() => triggerMut.mutate({ rhythmId: r.id })}
                  className="w-full mt-3 bg-gray-700 hover:bg-violet-800 rounded text-xs py-1"
                >
                  ØªØ´ØºÙŠÙ„ ÙŠØ¯ÙˆÙŠ
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Execution Logs */}
        {logsQ.data && (
          <div className="bg-gray-900 border border-gray-700 rounded-xl p-5">
            <h2 className="text-lg font-bold mb-3 text-violet-300">ðŸ“‹ Ø³Ø¬Ù„ Ø§Ù„ØªÙ†ÙÙŠØ°</h2>
            <div className="space-y-2 max-h-60 overflow-y-auto">
              {logsQ.data.length === 0 ? (
                <div className="text-gray-500 text-center py-8">Ù„Ø§ ØªÙˆØ¬Ø¯ Ø³Ø¬Ù„Ø§Øª Ø¨Ø¹Ø¯ â€” Ø´ØºÙ‘Ù„ Ø¥ÙŠÙ‚Ø§Ø¹Ø§Ù‹ Ù„Ø¨Ø¯Ø¡ Ø§Ù„ØªØªØ¨Ø¹</div>
              ) : (
                logsQ.data.map((log: any) => (
                  <div key={log.id} className="flex items-center gap-3 text-sm bg-gray-800 rounded-lg p-2">
                    <span className="text-gray-500 text-xs">{new Date(log.time).toLocaleTimeString('ar-SA')}</span>
                    <span className="text-violet-300 font-bold">{RHYTHM_ICONS[log.rhythm] ?? "âš¡"} {log.rhythm}</span>
                    <span className={`text-xs ${log.status === "SUCCESS" ? "text-green-400" : log.status === "PARTIAL" ? "text-yellow-400" : "text-red-400"}`}>
                      {log.status}
                    </span>
                    <span className="text-gray-500 text-xs">{log.duration}ms</span>
                    <span className="text-gray-600 text-xs">{log.actions} Ø¥Ø¬Ø±Ø§Ø¡</span>
                  </div>
                ))
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
