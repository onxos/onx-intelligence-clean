import { trpc } from "@/providers/trpc"
import BackButton from '../components/BackButton'

export default function Geo() {
  const statsQ = trpc.gps.stats.useQuery()
  const alertsQ = trpc.gps.alerts.useQuery()
  const positionsQ = trpc.gps.positions.useQuery()
  const appointmentsQ = trpc.gps.appointments.useQuery()

  return (
    <div dir="rtl" className="min-h-screen bg-gray-950 text-white p-6">
      <BackButton />
      <div className="max-w-6xl mx-auto">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-cyan-400">ðŸ—ºï¸ Ø§Ù„Ø°ÙƒØ§Ø¡ Ø§Ù„Ø¬ØºØ±Ø§ÙÙŠ</h1>
          <p className="text-gray-400 mt-1">ØªØªØ¨Ø¹ Ø§Ù„Ø¹ÙŠØ§Ø¯Ø§Øª Ø§Ù„Ù…ØªÙ†Ù‚Ù„Ø© â€” ØªÙ†Ø¨ÙŠÙ‡ Ø§Ù„ØªØ£Ø®ÙŠØ± Ù‚Ø¨Ù„ 15 Ø¯Ù‚ÙŠÙ‚Ø©</p>
        </div>

        {/* Alert Banner */}
        {alertsQ.data && alertsQ.data.total > 0 && (
          <div className="bg-red-900/40 border border-red-500 rounded-xl p-4 mb-6">
            <div className="flex items-center gap-3">
              <span className="text-2xl">ðŸš¨</span>
              <div>
                <div className="font-bold text-red-300">
                  {alertsQ.data.critical} ØªÙ†Ø¨ÙŠÙ‡ Ø­Ø±Ø¬ØŒ {alertsQ.data.warnings} ØªØ­Ø°ÙŠØ±
                </div>
                <div className="text-red-400 text-sm mt-1">
                  {alertsQ.data.alerts.slice(0, 2).map((a) => (
                    <div key={a.appointmentId}>{a.messageAr}</div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Fleet Stats */}
        {statsQ.data && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
            {[
              { label: "Ø§Ù„Ù…Ø±ÙƒØ¨Ø§Øª Ø§Ù„Ù†Ø´Ø·Ø©", value: `${statsQ.data.movingVehicles}/${statsQ.data.totalVehicles}`, color: "text-cyan-400" },
              { label: "Ù…ÙˆØ§Ø¹ÙŠØ¯ Ø§Ù„ÙŠÙˆÙ…", value: statsQ.data.totalAppointments, color: "text-blue-400" },
              { label: "ÙÙŠ Ø§Ù„Ù…ÙˆØ¹Ø¯", value: statsQ.data.onTimeAppointments, color: "text-green-400" },
              { label: "ØªÙ†Ø¨ÙŠÙ‡Ø§Øª ØªØ£Ø®ÙŠØ±", value: statsQ.data.activeAlerts, color: statsQ.data.activeAlerts > 0 ? "text-red-400" : "text-gray-500" },
            ].map((card) => (
              <div key={card.label} className="bg-gray-900 border border-gray-700 rounded-xl p-4 text-center">
                <div className={`text-2xl font-bold ${card.color}`}>{card.value}</div>
                <div className="text-gray-400 text-sm mt-1">{card.label}</div>
              </div>
            ))}
          </div>
        )}

        <div className="grid md:grid-cols-2 gap-6">
          {/* Vehicle Positions */}
          {positionsQ.data && (
            <div className="bg-gray-900 border border-gray-700 rounded-xl p-5">
              <h2 className="text-lg font-bold mb-4 text-cyan-300">ðŸš Ù…ÙˆØ§Ù‚Ø¹ Ø§Ù„Ù…Ø±ÙƒØ¨Ø§Øª</h2>
              <div className="space-y-3">
                {positionsQ.data.map((v) => (
                  <div key={v.vehicleId} className="flex items-center justify-between border-b border-gray-800 pb-2">
                    <div>
                      <span className="font-bold text-cyan-400">{v.vehicleId}</span>
                      <div className="text-gray-400 text-xs mt-0.5">{v.address}</div>
                    </div>
                    <div className="text-left text-sm">
                      <span className={`font-bold ${v.speed > 0 ? "text-green-400" : "text-gray-500"}`}>
                        {v.speed} ÙƒÙ…/Ø³
                      </span>
                      <div className="text-gray-500 text-xs">{v.lat.toFixed(4)}, {v.lng.toFixed(4)}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Appointments */}
          {appointmentsQ.data && (
            <div className="bg-gray-900 border border-gray-700 rounded-xl p-5">
              <h2 className="text-lg font-bold mb-4 text-blue-300">ðŸ“… Ù…ÙˆØ§Ø¹ÙŠØ¯ Ø§Ù„ÙŠÙˆÙ…</h2>
              <div className="space-y-3">
                {appointmentsQ.data.map((apt) => (
                  <div key={apt.id} className={`p-3 rounded-lg border ${apt.atRisk ? "border-red-700 bg-red-900/20" : "border-gray-700 bg-gray-800"}`}>
                    <div className="flex justify-between items-start">
                      <div>
                        <div className="font-bold text-sm text-white">{apt.clientName}</div>
                        <div className="text-gray-400 text-xs">{apt.address} â€¢ {apt.vehicleId}</div>
                      </div>
                      <div className="text-left">
                        {apt.atRisk ? (
                          <span className="text-red-400 text-xs font-bold">âš ï¸ +{apt.delayMinutes} Ø¯Ù‚ÙŠÙ‚Ø©</span>
                        ) : (
                          <span className="text-green-400 text-xs">âœ… ÙÙŠ Ø§Ù„Ù…ÙˆØ¹Ø¯</span>
                        )}
                        <div className="text-gray-500 text-xs">{apt.distanceKm} ÙƒÙ…</div>
                      </div>
                    </div>
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
