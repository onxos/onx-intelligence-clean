import { trpc } from "@/providers/trpc"
import BackButton from '../components/BackButton'

// Arabic labels for the 10 platform event types (Phase E1)
const EVENT_TYPE_LABELS: Record<string, string> = {
  "pharmacy.dispense.created": "صرف صيدلية",
  "procurement.grn.created": "استلام مشتريات",
  "procurement.po.created": "أمر شراء",
  "hr.attendance.recorded": "تسجيل حضور",
  "billing.invoice.created": "فاتورة",
  "insurance.claim.created": "مطالبة تأمين",
  "clinic.appointment.completed": "موعد مكتمل",
  "inventory.movement.created": "حركة مخزون",
  "finance.payment.received": "دفعة مستلمة",
  "lab.result.created": "نتيجة مختبر",
}

const EVENT_TYPE_COLORS: Record<string, string> = {
  "pharmacy.dispense.created": "bg-emerald-500",
  "procurement.grn.created": "bg-cyan-500",
  "procurement.po.created": "bg-sky-500",
  "hr.attendance.recorded": "bg-violet-500",
  "billing.invoice.created": "bg-amber-500",
  "insurance.claim.created": "bg-rose-500",
  "clinic.appointment.completed": "bg-teal-500",
  "inventory.movement.created": "bg-indigo-500",
  "finance.payment.received": "bg-lime-500",
  "lab.result.created": "bg-fuchsia-500",
}

function typeLabel(eventType: string): string {
  return EVENT_TYPE_LABELS[eventType] ?? eventType
}

function typeColor(eventType: string): string {
  return EVENT_TYPE_COLORS[eventType] ?? "bg-gray-500"
}

function formatTimestamp(value: string | null | undefined): string {
  if (!value) return "—"
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return "غير متاح"
  return date.toLocaleString("ar-EG", { dateStyle: "medium", timeStyle: "short" })
}

function relativeTime(value: string | null | undefined): string {
  if (!value) return "—"
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return "—"
  const diffMs = Date.now() - date.getTime()
  const minutes = Math.floor(diffMs / 60_000)
  if (minutes < 1) return "الآن"
  if (minutes < 60) return `قبل ${minutes} دقيقة`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `قبل ${hours} ساعة`
  const days = Math.floor(hours / 24)
  return `قبل ${days} يوماً`
}

export default function TitanPulse() {
  const statsQ = trpc.titan.inboxStats.useQuery(undefined, { refetchInterval: 30_000 })
  const recentQ = trpc.titan.recentEvents.useQuery({ limit: 20 }, { refetchInterval: 30_000 })

  const stats = statsQ.data
  const events = recentQ.data?.events ?? []
  const maxTypeCount = Math.max(1, ...(stats?.byType.map((t) => t.count) ?? [1]))
  const isLive = !statsQ.isError && !recentQ.isError

  return (
    <div dir="rtl" className="min-h-screen bg-gray-950 text-white p-6">
      <BackButton />
      <div className="max-w-6xl mx-auto">
        <div className="mb-8 flex items-end justify-between flex-wrap gap-4">
          <div>
            <h1 className="text-3xl font-bold text-emerald-400">📡 نبض المنصة — العقل يقرأ الجسد</h1>
            <p className="text-gray-400 mt-1">
              Platform Pulse — صندوق أحداث المنصة (onx_platform_event_inbox) بتحديث كل 30 ثانية · المرحلة هـ-1
            </p>
          </div>
          <div
            className={`flex items-center gap-2 border rounded-full px-4 py-1.5 text-sm font-bold ${
              isLive
                ? "border-emerald-700 bg-emerald-950/40 text-emerald-300"
                : "border-red-700 bg-red-950/40 text-red-300"
            }`}
          >
            <span className="relative flex h-2.5 w-2.5">
              {isLive && (
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
              )}
              <span
                className={`relative inline-flex rounded-full h-2.5 w-2.5 ${isLive ? "bg-emerald-500" : "bg-red-500"}`}
              />
            </span>
            {isLive ? "حي" : "منقطع"}
          </div>
        </div>

        {(statsQ.isError || recentQ.isError) && (
          <div className="bg-red-950/40 border border-red-800 rounded-xl p-4 mb-6 text-red-300 text-sm">
            تعذر الوصول إلى صندوق الأحداث — {statsQ.error?.message ?? recentQ.error?.message}
          </div>
        )}

        {/* Headline stats */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3 mb-6">
          <div className="bg-gradient-to-l from-emerald-950 to-gray-900 border border-emerald-700 rounded-2xl p-5">
            <div className="text-gray-400 text-xs">إجمالي الأحداث المستلمة</div>
            <div className="text-4xl font-bold text-emerald-300 mt-1">
              {stats ? stats.totalEvents.toLocaleString("ar-EG") : "…"}
            </div>
          </div>
          <div className="bg-gray-900 border border-cyan-800 rounded-2xl p-5">
            <div className="text-gray-400 text-xs">آخر 24 ساعة</div>
            <div className="text-4xl font-bold text-cyan-300 mt-1">
              {stats ? stats.last24hCount.toLocaleString("ar-EG") : "…"}
            </div>
          </div>
          <div className="bg-gray-900 border border-gray-700 rounded-2xl p-5">
            <div className="text-gray-400 text-xs">أول حدث</div>
            <div className="text-sm font-bold text-gray-200 mt-2">{formatTimestamp(stats?.oldestReceivedAt)}</div>
          </div>
          <div className="bg-gray-900 border border-gray-700 rounded-2xl p-5">
            <div className="text-gray-400 text-xs">أحدث حدث</div>
            <div className="text-sm font-bold text-gray-200 mt-2">{formatTimestamp(stats?.newestReceivedAt)}</div>
            <div className="text-[11px] text-gray-500 mt-1">{relativeTime(stats?.newestReceivedAt)}</div>
          </div>
        </div>

        {/* Distribution by type */}
        <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5 mb-6">
          <h2 className="text-lg font-bold text-emerald-300 mb-4">توزيع الأحداث حسب النوع</h2>
          {stats && stats.byType.length === 0 && (
            <div className="text-gray-500 text-sm">لا توجد أحداث مستلمة بعد — الصندوق فارغ</div>
          )}
          <div className="space-y-3">
            {stats?.byType.map((t) => (
              <div key={t.eventType}>
                <div className="flex justify-between text-xs mb-1">
                  <span className="text-gray-300">
                    {typeLabel(t.eventType)}{" "}
                    <span className="text-gray-600 font-mono text-[10px]" dir="ltr">{t.eventType}</span>
                  </span>
                  <span className="text-gray-400 font-bold">{t.count.toLocaleString("ar-EG")}</span>
                </div>
                <div className="h-2.5 bg-gray-800 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full ${typeColor(t.eventType)}`}
                    style={{ width: `${Math.max(2, (t.count / maxTypeCount) * 100)}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Recent events */}
        <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5">
          <h2 className="text-lg font-bold text-emerald-300 mb-4">آخر 20 حدثاً</h2>
          {recentQ.isLoading && <div className="text-gray-500 text-sm">جارٍ التحميل…</div>}
          {!recentQ.isLoading && events.length === 0 && (
            <div className="text-gray-500 text-sm">لا توجد أحداث بعد</div>
          )}
          {events.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-gray-500 text-xs border-b border-gray-800">
                    <th className="text-right py-2 px-2">النوع</th>
                    <th className="text-right py-2 px-2">الكيان</th>
                    <th className="text-right py-2 px-2">وقت الوقوع</th>
                    <th className="text-right py-2 px-2">وقت الاستلام</th>
                  </tr>
                </thead>
                <tbody>
                  {events.map((e) => (
                    <tr key={e.id} className="border-b border-gray-800/60 hover:bg-gray-800/30">
                      <td className="py-2 px-2">
                        <span className="inline-flex items-center gap-2">
                          <span className={`h-2 w-2 rounded-full ${typeColor(e.eventType)}`} />
                          <span className="text-gray-200">{typeLabel(e.eventType)}</span>
                        </span>
                      </td>
                      <td className="py-2 px-2 text-gray-400 font-mono text-xs" dir="ltr">
                        {e.aggregateType ?? "—"}/{e.aggregateId ?? "—"}
                      </td>
                      <td className="py-2 px-2 text-gray-400 text-xs">{formatTimestamp(e.occurredAt)}</td>
                      <td className="py-2 px-2 text-gray-500 text-xs">{relativeTime(e.receivedAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <p className="text-[11px] text-gray-600 mt-6">
          المصدر: titan.inboxStats + titan.recentEvents (قراءة فقط، بدون حمولات) · المرحلة هـ-1 «العقل يقرأ الجسد»
        </p>
      </div>
    </div>
  )
}
