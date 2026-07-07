import { trpc } from "@/providers/trpc"
import BackButton from '../components/BackButton'

export default function Revenue() {
  const statsQ = trpc.revenueEngine.stats.useQuery()
  const targetsQ = trpc.revenueEngine.targets.useQuery({ monthlyTarget: 150000 })
  const byServiceQ = trpc.revenueEngine.byService.useQuery()
  const zatcaQ = trpc.revenueEngine.zatca.useQuery()

  return (
    <div dir="rtl" className="min-h-screen bg-gray-950 text-white p-6">
      <BackButton />
      <div className="max-w-6xl mx-auto">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-emerald-400">âš™ï¸ Ù…Ø­Ø±Ùƒ Ø§Ù„Ø¥ÙŠØ±Ø§Ø¯Ø§Øª</h1>
          <p className="text-gray-400 mt-1">Ø­Ø³Ø§Ø¨ Ø£Ù‡Ø¯Ø§Ù Ø§Ù„Ø¥ÙŠØ±Ø§Ø¯Ø§Øª ØªÙ„Ù‚Ø§Ø¦ÙŠØ§Ù‹ â€” ZATCA Phase 2</p>
        </div>

        {/* Summary Cards */}
        {statsQ.data && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
            {[
              { label: "Ø¥ÙŠØ±Ø§Ø¯Ø§Øª Ø§Ù„ÙŠÙˆÙ…", value: `${statsQ.data.todayRevenue.toLocaleString()} ï·¼`, color: "text-emerald-400" },
              { label: "Ù…Ø¹Ø§Ù…Ù„Ø§Øª Ø§Ù„ÙŠÙˆÙ…", value: statsQ.data.todayTransactions, color: "text-blue-400" },
              { label: "Ø§Ù„Ø¥Ù†Ø¬Ø§Ø² Ø§Ù„Ø´Ù‡Ø±ÙŠ", value: `${statsQ.data.monthlyAchievement}%`, color: statsQ.data.onTrack ? "text-green-400" : "text-yellow-400" },
              { label: "Ø§Ù„Ø¶Ø±ÙŠØ¨Ø© Ø§Ù„Ù…Ø­ØµÙ„Ø©", value: `${statsQ.data.totalVatCollected.toLocaleString()} ï·¼`, color: "text-purple-400" },
            ].map((card) => (
              <div key={card.label} className="bg-gray-900 border border-gray-700 rounded-xl p-4 text-center">
                <div className={`text-2xl font-bold ${card.color}`}>{card.value}</div>
                <div className="text-gray-400 text-sm mt-1">{card.label}</div>
              </div>
            ))}
          </div>
        )}

        {/* Monthly Target Progress */}
        {targetsQ.data && (
          <div className="bg-gray-900 border border-gray-700 rounded-xl p-6 mb-6">
            <h2 className="text-xl font-bold mb-4 text-emerald-300">ðŸ“Š Ø§Ù„Ù‡Ø¯Ù Ø§Ù„Ø´Ù‡Ø±ÙŠ</h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
              {[
                { label: "Ø§Ù„Ù‡Ø¯Ù", value: `${(targetsQ.data.monthlyTarget / 1000).toFixed(0)}K ï·¼` },
                { label: "Ø§Ù„ÙØ¹Ù„ÙŠ Ø­ØªÙ‰ Ø§Ù„Ø¢Ù†", value: `${(targetsQ.data.actualToDate / 1000).toFixed(1)}K ï·¼` },
                { label: "Ø§Ù„Ù…ØªÙˆÙ‚Ø¹", value: `${(targetsQ.data.expectedToDate / 1000).toFixed(1)}K ï·¼` },
                { label: "Ø§Ù„ÙØ§Ø±Ù‚", value: `${targetsQ.data.variance > 0 ? "+" : ""}${(targetsQ.data.variance / 1000).toFixed(1)}K ï·¼`, color: targetsQ.data.variance >= 0 ? "text-green-400" : "text-red-400" },
              ].map((item) => (
                <div key={item.label} className="text-center">
                  <div className={`text-xl font-bold ${(item as any).color ?? "text-white"}`}>{item.value}</div>
                  <div className="text-gray-400 text-sm">{item.label}</div>
                </div>
              ))}
            </div>
            <div className="w-full bg-gray-700 rounded-full h-3 mt-2">
              <div
                className={`h-3 rounded-full ${targetsQ.data.onTrack ? "bg-emerald-500" : "bg-yellow-500"}`}
                style={{ width: `${Math.min(100, targetsQ.data.achievementRate)}%` }}
              />
            </div>
            <div className="text-sm text-gray-400 mt-2 text-center">
              {targetsQ.data.achievementRate}% â€” {targetsQ.data.onTrack ? "âœ… Ø¹Ù„Ù‰ Ø§Ù„Ù…Ø³Ø§Ø±" : "âš ï¸ ÙŠØ­ØªØ§Ø¬ Ù…Ø±Ø§Ø¬Ø¹Ø©"} â€” {targetsQ.data.daysRemaining} ÙŠÙˆÙ… Ù…ØªØ¨Ù‚ÙŠ
            </div>
          </div>
        )}

        {/* Services Revenue Breakdown */}
        <div className="grid md:grid-cols-2 gap-6 mb-6">
          {byServiceQ.data && (
            <div className="bg-gray-900 border border-gray-700 rounded-xl p-5">
              <h2 className="text-lg font-bold mb-4 text-blue-300">ðŸ’Š Ø§Ù„Ø¥ÙŠØ±Ø§Ø¯Ø§Øª Ø­Ø³Ø¨ Ø§Ù„Ø®Ø¯Ù…Ø©</h2>
              <div className="space-y-2">
                {byServiceQ.data.slice(0, 6).map((svc) => (
                  <div key={svc.nameAr} className="flex justify-between items-center">
                    <span className="text-gray-300 text-sm">{svc.nameAr}</span>
                    <div className="text-left">
                      <span className="text-emerald-400 text-sm font-bold">{svc.revenue.toLocaleString()} ï·¼</span>
                      <span className="text-gray-500 text-xs mr-2">({svc.count} Ù…Ø¹Ø§Ù…Ù„Ø©)</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ZATCA Status */}
          {zatcaQ.data && (
            <div className="bg-gray-900 border border-gray-700 rounded-xl p-5">
              <h2 className="text-lg font-bold mb-4 text-purple-300">ðŸ§¾ ZATCA Phase 2</h2>
              <div className="space-y-3">
                {[
                  { label: "ÙÙˆØ§ØªÙŠØ± Ù…Ø¹ØªÙ…Ø¯Ø©", value: zatcaQ.data.approved, color: "text-green-400" },
                  { label: "ÙÙˆØ§ØªÙŠØ± Ù…Ø±Ø³Ù„Ø©", value: zatcaQ.data.submitted, color: "text-blue-400" },
                  { label: "ÙÙˆØ§ØªÙŠØ± Ù…Ø¹Ù„Ù‚Ø©", value: zatcaQ.data.pending, color: "text-yellow-400" },
                  { label: "Ù†Ø³Ø¨Ø© Ø§Ù„Ø§Ù…ØªØ«Ø§Ù„", value: `${zatcaQ.data.complianceRate}%`, color: "text-emerald-400" },
                  { label: "Ø§Ù„Ø¶Ø±ÙŠØ¨Ø© Ø§Ù„Ù…Ø­ØµÙ„Ø©", value: `${zatcaQ.data.totalVatCollected.toLocaleString()} ï·¼`, color: "text-white" },
                ].map((item) => (
                  <div key={item.label} className="flex justify-between">
                    <span className="text-gray-400 text-sm">{item.label}</span>
                    <span className={`font-bold text-sm ${item.color}`}>{item.value}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
