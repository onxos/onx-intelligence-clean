import { trpc } from "@/providers/trpc"
import BackButton from '../components/BackButton'

// ============================================================
// نبض العقل — Wave 11-b
// Live view of the mind's reflective state: health.reflection
// counters + the newest insights (health.insightsPublic),
// refreshed every 15 seconds. Read-only, no secrets.
// ============================================================

const VERDICTS_INSIGHT_ID = "insight-verdicts"

// Arabic labels for insight kinds. The reflection cycle emits ids like
// insight-cycle-*, insight-pattern-*, insight-coverage, insight-verdicts —
// the id prefix is more telling than the node type (always PATTERN today).
function insightKind(id: string, type: string): { label: string; classes: string } {
  if (id === VERDICTS_INSIGHT_ID)
    return { label: "مرآة الأحكام", classes: "bg-violet-950/60 border-violet-600 text-violet-300" }
  if (id.startsWith("insight-cycle"))
    return { label: "دورة", classes: "bg-cyan-950/60 border-cyan-700 text-cyan-300" }
  if (id.startsWith("insight-coverage"))
    return { label: "تغطية", classes: "bg-amber-950/60 border-amber-700 text-amber-300" }
  if (id.startsWith("insight-pattern") || type === "PATTERN")
    return { label: "نمط", classes: "bg-emerald-950/60 border-emerald-700 text-emerald-300" }
  return { label: type, classes: "bg-gray-800 border-gray-600 text-gray-300" }
}

const VERIFICATION_LABELS: Record<string, string> = {
  VERIFIED: "مؤكدة",
  PROBABLE: "مرجّحة",
  UNVERIFIED: "غير مؤكدة",
}

function formatTimestamp(value: string | null | undefined): string {
  if (!value) return "—"
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return "غير متاح"
  return date.toLocaleString("ar-EG", { dateStyle: "medium", timeStyle: "short" })
}

function relativeTime(value: string | Date | null | undefined): string {
  if (!value) return "—"
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) return "—"
  const diffMs = Date.now() - date.getTime()
  const minutes = Math.floor(diffMs / 60_000)
  if (minutes < 1) return "الآن"
  if (minutes < 60) return `منذ ${minutes} دقيقة`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `منذ ${hours} ساعة`
  const days = Math.floor(hours / 24)
  return `منذ ${days} يوماً`
}

function num(value: number | undefined): string {
  return typeof value === "number" ? value.toLocaleString("ar-EG") : "…"
}

function CounterCard({
  label,
  value,
  hint,
  accent = "border-gray-700 text-gray-100",
}: {
  label: string
  value: string
  hint?: string
  accent?: string
}) {
  return (
    <div className={`bg-gray-900 border rounded-2xl p-5 ${accent}`}>
      <div className="text-gray-400 text-xs">{label}</div>
      <div className="text-3xl font-bold mt-1">{value}</div>
      {hint && <div className="text-[11px] text-gray-500 mt-1">{hint}</div>}
    </div>
  )
}

function SkeletonBlock({ className }: { className: string }) {
  return <div className={`animate-pulse bg-gray-800/80 rounded-2xl ${className}`} />
}

export default function TitanPulse() {
  const reflectionQ = trpc.health.reflection.useQuery(undefined, { refetchInterval: 15_000 })
  const insightsQ = trpc.health.insightsPublic.useQuery({ limit: 20 }, { refetchInterval: 15_000 })

  const r = reflectionQ.data
  const insights = insightsQ.data?.insights ?? []
  const isLive = !reflectionQ.isError && !insightsQ.isError
  const firstLoad = reflectionQ.isLoading && !r

  return (
    <div dir="rtl" className="min-h-screen bg-gray-950 text-white p-6">
      <BackButton />
      <div className="max-w-6xl mx-auto">
        <div className="mb-8 flex items-end justify-between flex-wrap gap-4">
          <div>
            <h1 className="text-3xl font-bold text-emerald-400">🧠 نبض العقل</h1>
            <p className="text-gray-400 mt-1">
              الحالة التأملية الحية — دورة التأمل والرؤى المولّدة، بتحديث كل 15 ثانية · الموجة 11-ب
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

        {(reflectionQ.isError || insightsQ.isError) && (
          <div className="bg-red-950/40 border border-red-800 rounded-xl p-4 mb-6 text-red-300 text-sm">
            تعذر الوصول إلى نبض العقل — سيُعاد المحاولة تلقائياً.{" "}
            <span className="text-red-400/70" dir="ltr">
              {reflectionQ.error?.message ?? insightsQ.error?.message}
            </span>
          </div>
        )}

        {/* First-load skeleton */}
        {firstLoad && (
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3 mb-6">
            {Array.from({ length: 8 }, (_, i) => (
              <SkeletonBlock key={i} className="h-24" />
            ))}
          </div>
        )}

        {/* Reflection counters */}
        {r && (
          <>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-3 mb-3">
              <div className="bg-gradient-to-l from-emerald-950 to-gray-900 border border-emerald-700 rounded-2xl p-5">
                <div className="text-gray-400 text-xs">الرؤى المولّدة</div>
                <div className="text-4xl font-bold text-emerald-300 mt-1">{num(r.insightsGenerated)}</div>
                {r.insightsFailed > 0 && (
                  <div className="text-[11px] text-red-400 mt-1">إخفاقات: {num(r.insightsFailed)}</div>
                )}
              </div>
              <CounterCard label="القواعد المقيّمة" value={num(r.rulesEvaluated)} accent="border-cyan-800 text-cyan-300" />
              <CounterCard label="الإدراكات الممسوحة" value={num(r.perceptionsScanned)} accent="border-sky-800 text-sky-300" />
              <CounterCard
                label="دورات التأمل"
                value={num(r.ticksTotal)}
                hint={`المتخطاة: ${num(r.ticksSkipped)}`}
                accent="border-gray-700 text-gray-100"
              />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-3 mb-6">
              <CounterCard
                label="أحكام المؤسس المستلمة"
                value={num(r.acksReceivedTotal)}
                hint={r.acksFailedTotal > 0 ? `المرفوضة: ${num(r.acksFailedTotal)}` : undefined}
                accent="border-violet-800 text-violet-300"
              />
              <CounterCard
                label="الرؤى المُخدّمة للجسد"
                value={num(r.insightsServedTotal)}
                accent="border-amber-800 text-amber-300"
              />
              <div className="bg-gray-900 border border-gray-700 rounded-2xl p-5">
                <div className="text-gray-400 text-xs">آخر دورة تأمل</div>
                <div className="text-lg font-bold text-gray-200 mt-1">{relativeTime(r.lastRunAt)}</div>
                <div className="text-[11px] text-gray-500 mt-1">{formatTimestamp(r.lastRunAt)}</div>
              </div>
              {r.lastError ? (
                <div className="bg-red-950/50 border border-red-700 rounded-2xl p-5">
                  <div className="text-red-300 text-xs font-bold">آخر خطأ في الدورة</div>
                  <div className="text-sm text-red-200 mt-2 break-words" dir="ltr">
                    {r.lastError}
                  </div>
                </div>
              ) : (
                <div className="bg-gray-900 border border-emerald-900 rounded-2xl p-5">
                  <div className="text-gray-400 text-xs">آخر خطأ في الدورة</div>
                  <div className="text-lg font-bold text-emerald-400 mt-1">لا أخطاء ✓</div>
                </div>
              )}
            </div>
          </>
        )}

        {/* Live insights */}
        <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5">
          <h2 className="text-lg font-bold text-emerald-300 mb-4">الرؤى الحية — أحدث 20 رؤية</h2>
          {insightsQ.isLoading && (
            <div className="space-y-3">
              {Array.from({ length: 4 }, (_, i) => (
                <SkeletonBlock key={i} className="h-16" />
              ))}
            </div>
          )}
          {!insightsQ.isLoading && insights.length === 0 && (
            <div className="text-gray-500 text-sm">لا رؤى بعد — العقل ما زال يتأمل</div>
          )}
          <div className="space-y-3">
            {insights.map((ins) => {
              const kind = insightKind(ins.id, ins.type)
              const isVerdicts = ins.id === VERDICTS_INSIGHT_ID
              return (
                <div
                  key={ins.id}
                  className={`rounded-xl border p-4 ${
                    isVerdicts
                      ? "bg-violet-950/30 border-violet-700"
                      : "bg-gray-950/60 border-gray-800 hover:bg-gray-800/30"
                  }`}
                >
                  <div className="flex items-center justify-between flex-wrap gap-2 mb-2">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`text-[11px] font-bold border rounded-full px-2.5 py-0.5 ${kind.classes}`}>
                        {kind.label}
                      </span>
                      <span className="text-[11px] text-gray-500 border border-gray-800 rounded-full px-2.5 py-0.5">
                        {VERIFICATION_LABELS[ins.verification] ?? ins.verification}
                      </span>
                      {isVerdicts && (
                        <span className="text-[11px] text-violet-400">مرآة أحكام المؤسس</span>
                      )}
                    </div>
                    <span className="text-[11px] text-gray-500">{relativeTime(ins.createdAt)}</span>
                  </div>
                  <p className={`text-sm leading-relaxed ${isVerdicts ? "text-violet-100" : "text-gray-200"}`}>
                    {ins.contentText || "—"}
                  </p>
                  <div className="text-[10px] text-gray-600 font-mono mt-2" dir="ltr">
                    {ins.id}
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        <p className="text-[11px] text-gray-600 mt-6">
          المصدر: health.reflection + health.insightsPublic (قراءة فقط، بلا أسرار) · الموجة 11-ب «نبض العقل»
        </p>
      </div>
    </div>
  )
}
