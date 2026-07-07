import { trpc } from "@/providers/trpc"
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
          <h1 className="text-3xl font-bold text-amber-400">âš–ï¸ Ù„ÙˆØ­Ø© Ø§Ù„Ø¯Ø³ØªÙˆØ±</h1>
          <p className="text-gray-400 mt-1">Guardian Ø§Ù„Ø­Ø§Ø±Ø³ Ø§Ù„Ø¯Ø³ØªÙˆØ±ÙŠ â€” Ø§Ù„Ù…Ø¨Ø§Ø¯Ø¦ Ø§Ù„Ø³Ø¨Ø¹Ø© â€” Ù‚Ø±Ø§Ø±Ø§Øª Ø§Ù„Ø­ÙƒÙ…</p>
        </div>

        {/* 7 Principles */}
        {principlesQ.data && (
          <div className="bg-gray-900 border border-amber-700 rounded-xl p-6 mb-6">
            <h2 className="text-xl font-bold mb-4 text-amber-300">ðŸ“œ Ø§Ù„Ù…Ø¨Ø§Ø¯Ø¦ Ø§Ù„Ø¯Ø³ØªÙˆØ±ÙŠØ© Ø§Ù„Ø³Ø¨Ø¹Ø©</h2>
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
              <h3 className="font-bold text-cyan-300 mb-3">âš¡ Rate Limiting</h3>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-400">Ø§Ù„Ø·Ù„Ø¨Ø§Øª Ø§Ù„Ù†Ø´Ø·Ø©</span>
                  <span className="text-cyan-400">{rateLimitQ.data.totalRequests}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">Workspaces</span>
                  <span className="text-cyan-400">{rateLimitQ.data.totalWorkspaces}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">Ø§Ù„Ø­Ø¯ Ø§Ù„Ø£Ù‚ØµÙ‰</span>
                  <span className="text-white">100 RPM</span>
                </div>
              </div>
            </div>
          )}

          {/* Budget */}
          {budgetQ.data && (
            <div className="bg-gray-900 border border-gray-700 rounded-xl p-5">
              <h3 className="font-bold text-emerald-300 mb-3">ðŸ’° Ø§Ù„Ù…ÙŠØ²Ø§Ù†ÙŠØ© Ø§Ù„ÙŠÙˆÙ…ÙŠØ©</h3>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-400">Ø§Ù„Ù…Ù†ÙÙ‚</span>
                  <span className="text-emerald-400">${budgetQ.data.spent}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">Ø§Ù„Ù…ØªØ¨Ù‚ÙŠ</span>
                  <span className="text-green-400">${budgetQ.data.remaining}</span>
                </div>
                <div className="w-full bg-gray-700 rounded-full h-2 mt-2">
                  <div className="bg-emerald-500 h-2 rounded-full" style={{ width: `${budgetQ.data.percent}%` }} />
                </div>
                <div className="text-gray-500 text-xs text-center">{budgetQ.data.percent.toFixed(1)}% Ù…Ù† $10</div>
              </div>
            </div>
          )}

          {/* Cost Dashboard */}
          {costQ.data && (
            <div className="bg-gray-900 border border-gray-700 rounded-xl p-5">
              <h3 className="font-bold text-purple-300 mb-3">ðŸ“Š Ù„ÙˆØ­Ø© Ø§Ù„ØªÙƒØ§Ù„ÙŠÙ</h3>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-400">Ø¥Ø¬Ù…Ø§Ù„ÙŠ Ø§Ù„Ø·Ù„Ø¨Ø§Øª</span>
                  <span className="text-purple-400">{costQ.data.totalCalls}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">Ø¥Ø¬Ù…Ø§Ù„ÙŠ Ø§Ù„ØªÙƒÙ„ÙØ©</span>
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
          <h2 className="text-xl font-bold mb-4 text-blue-300">ðŸ§ª Ø§Ø®ØªØ¨Ø§Ø±Ø§Øª Ø§Ù„ØªØ¯ÙÙ‚</h2>
          <div className="flex flex-wrap gap-3 mb-4">
            <button
              onClick={() => testMut.mutate()}
              disabled={testMut.isPending}
              className="bg-blue-800 hover:bg-blue-700 disabled:opacity-50 px-4 py-2 rounded-lg text-sm font-bold"
            >
              {testMut.isPending ? "â³ Ø¬Ø§Ø±Ù..." : "â–¶ï¸ ØªØ¯ÙÙ‚ Ø§Ù„Ø°ÙƒØ§Ø¡"}
            </button>
            <button
              onClick={() => civilMut.mutate()}
              disabled={civilMut.isPending}
              className="bg-amber-800 hover:bg-amber-700 disabled:opacity-50 px-4 py-2 rounded-lg text-sm font-bold"
            >
              {civilMut.isPending ? "â³ Ø¬Ø§Ø±Ù..." : "â–¶ï¸ ØªØ¯ÙÙ‚ Ø§Ù„Ø­Ø¶Ø§Ø±Ø©"}
            </button>
          </div>

          {testMut.data && (
            <div className="bg-gray-800 rounded-lg p-3 mb-2">
              <div className="text-sm font-bold text-blue-300">Ø§Ù„Ø°ÙƒØ§Ø¡: {testMut.data.passed}/{testMut.data.total} Ù†Ø¬Ø­</div>
              <div className="mt-1 space-y-1">
                {testMut.data.details.map((d) => (
                  <div key={d.name} className={`text-xs ${d.passed ? "text-green-400" : "text-red-400"}`}>
                    {d.passed ? "âœ…" : "âŒ"} {d.name}
                  </div>
                ))}
              </div>
            </div>
          )}

          {civilMut.data && (
            <div className="bg-gray-800 rounded-lg p-3">
              <div className="text-sm font-bold text-amber-300">Ø§Ù„Ø­Ø¶Ø§Ø±Ø©: {civilMut.data.passed}/{civilMut.data.total} Ù†Ø¬Ø­</div>
              <div className="mt-1 space-y-1">
                {civilMut.data.details.map((d) => (
                  <div key={d.name} className={`text-xs ${d.passed ? "text-green-400" : "text-red-400"}`}>
                    {d.passed ? "âœ…" : "âŒ"} {d.name}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Gherkin Scenarios */}
        {gherkinQ.data && (
          <div className="bg-gray-900 border border-gray-700 rounded-xl p-6">
            <h2 className="text-xl font-bold mb-4 text-green-300">ðŸ“‹ {gherkinQ.data.total} Ø³ÙŠÙ†Ø§Ø±ÙŠÙˆ Gherkin</h2>
            <div className="grid md:grid-cols-2 gap-1">
              {gherkinQ.data.scenarios.map((s, i) => (
                <div key={i} className="text-xs text-gray-400 py-1 border-b border-gray-800">
                  âœ… {s}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
