// ============================================================
// /truth — STE-K-17 public, read-only, human-readable TRUTH PAGE.
//
// Mirrors W25/C-13: a plain-language window onto the system's MEASURED
// honesty. Every value is read live from the honest surfaces
// (onx.selfVerify, onx.truthHistory, corpusQuery.manifest, providers.status,
// /commit) via the pure
// buildTruthPageModel — ZERO hard-coded truth. A fetch failure renders a
// distinct fail-honest state (never a fake zero); an empty truth ledger
// renders a named EMPTY state. Arabic-first RTL with English labels.
// ============================================================
import { trpc } from "@/providers/trpc";
import { useQuery } from "@tanstack/react-query";
import BackButton from "@/components/BackButton";
import { Badge } from "@/components/ui/badge";
import { ShieldCheck, Database, History, GaugeCircle, Link2, AlertTriangle, Archive, Rocket } from "lucide-react";
import {
  buildTruthPageModel,
  type SourceOutcome,
  type SelfVerifyData,
  type CorpusManifestData,
  type ProvidersStatusData,
  type CommitData,
  type TruthHistoryData,
} from "../../api/lib/truth-page-model";

function toOutcome<T>(q: { isError: boolean; error: unknown; data: T | undefined }): SourceOutcome<T> {
  if (q.isError) {
    const msg = q.error instanceof Error ? q.error.message : "surface unreachable";
    return { ok: false, error: msg };
  }
  if (q.data !== undefined) return { ok: true, data: q.data };
  return { ok: false, error: "loading" };
}

// STE-K-27: the /commit deploy-info route is a SIBLING of this page under
// whichever mount serves it (app root `/truth` directly, or `…/intelligence/truth`
// via the gateway full-app mount). Derive the sibling URL from the live
// pathname so the freshness card reads the SAME origin/mount — no new surface,
// no hard-coded host.
function commitSiblingUrl(): string {
  const path = typeof window !== "undefined" ? window.location.pathname : "/truth";
  return path.replace(/truth\/?$/, "commit");
}

function StateBadge({ state }: { state: "OK" | "EMPTY" | "FETCH_FAILED" }) {
  if (state === "OK") return <Badge className="bg-emerald-600">حي · LIVE</Badge>;
  if (state === "EMPTY") return <Badge variant="secondary">فارغ بصدق · EMPTY</Badge>;
  return (
    <Badge variant="destructive" className="gap-1">
      <AlertTriangle className="w-3 h-3" /> تعذّر الجلب · FETCH FAILED
    </Badge>
  );
}

function Row({ label, en, value }: { label: string; en: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 py-1.5 border-b border-gray-100 last:border-0">
      <span className="text-sm text-gray-600">
        {label} <span className="text-gray-400 text-xs">· {en}</span>
      </span>
      <span className="text-sm font-medium text-gray-900 font-mono" dir="ltr">
        {value}
      </span>
    </div>
  );
}

function Section({
  icon,
  title,
  en,
  state,
  error,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  en: string;
  state: "OK" | "EMPTY" | "FETCH_FAILED";
  error: string | null;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="text-gray-700">{icon}</span>
          <h2 className="text-base font-semibold text-gray-900">
            {title} <span className="text-gray-400 text-xs font-normal">· {en}</span>
          </h2>
        </div>
        <StateBadge state={state} />
      </div>
      {state === "FETCH_FAILED" ? (
        <p className="text-sm text-red-600" dir="ltr">
          {error ?? "unreachable"}
        </p>
      ) : (
        children
      )}
    </div>
  );
}

const dash = "—";

export default function Truth() {
  const selfVerifyQ = trpc.onx.selfVerify.useQuery();
  const corpusQ = trpc.corpusQuery.manifest.useQuery();
  const providersQ = trpc.providers.status.useQuery();
  const truthHistoryQ = trpc.onx.truthHistory.useQuery({ limit: 10 });
  const commitQ = useQuery<CommitData>({
    queryKey: ["truth-commit"],
    queryFn: async () => {
      const res = await fetch(commitSiblingUrl(), { headers: { accept: "application/json" } });
      if (!res.ok) throw new Error(`commit surface ${res.status}`);
      return (await res.json()) as CommitData;
    },
  });

  const model = buildTruthPageModel({
    selfVerify: toOutcome<SelfVerifyData>(selfVerifyQ as never),
    corpus: toOutcome<CorpusManifestData>(corpusQ as never),
    providers: toOutcome<ProvidersStatusData>(providersQ as never),
    commit: toOutcome<CommitData>(commitQ as never),
    truthHistory: toOutcome<TruthHistoryData>(truthHistoryQ as never),
  });

  const { claims, corpus, ledger, ledgerRows, retention, rateLimit, bridges, freshness } = model;

  const rlPersisted = rateLimit.persistence === "POSTGRES_PERSISTED";

  return (
    <div dir="rtl" lang="ar" className="min-h-screen bg-gray-50 px-4 py-8">
      <div className="mx-auto max-w-3xl space-y-5">
        <div className="flex items-center justify-between">
          <BackButton />
          <span className="text-xs text-gray-400 font-mono" dir="ltr">
            {model.generatedAt}
          </span>
        </div>

        <header className="text-center space-y-2">
          <h1 className="text-2xl font-bold text-gray-900">صفحة الحقيقة · Truth</h1>
          <p className="text-sm text-gray-600">
            كل قيمة مقاسة حيًّا من الأسطح الصادقة — لا ادعاء ولا قيمة صلبة.
            <br />
            <span className="text-gray-400 text-xs">
              Every value measured live from the honest surfaces — no claims, no hard-coded truth.
            </span>
          </p>
        </header>

        {/* Deploy freshness (STE-K-27) */}
        <Section icon={<Rocket className="w-5 h-5" />} title="طزاجة النشر" en="Deploy freshness" state={freshness.state} error={freshness.error}>
          {freshness.state === "EMPTY" ? (
            <p className="text-sm text-gray-500">
              سطح النشر لا يُصدر بصمة الـcommit. · Deploy surface exposes no commit fingerprint.
            </p>
          ) : (
            <>
              <Row label="الإصدار المخدوم" en="served commit" value={freshness.commitShort ?? dash} />
              <Row label="اسم الخدمة" en="service" value={freshness.service ?? dash} />
              <Row label="وقت الإقلاع" en="bootTime" value={freshness.bootTime ?? dash} />
              <p className="mt-2 text-xs text-gray-500">
                الإصدار ووقت الإقلاع مقاسان من سطح <span dir="ltr">/commit</span> الحي — لا قيمة صلبة.
                <span className="text-gray-400"> · Served commit and boot time measured live from the /commit surface — no hard-coded value.</span>
              </p>
            </>
          )}
        </Section>

        {/* Self-verification claims */}
        <Section icon={<ShieldCheck className="w-5 h-5" />} title="التحقّق الذاتي" en="Self-verification" state={claims.state} error={claims.error}>
          <Row label="ادعاءات مقاسة" en="measured" value={claims.claimsMeasured ?? dash} />
          <Row label="ادعاءات مُدّعاة" en="asserted" value={claims.claimsAsserted ?? dash} />
          <Row label="عدد البنود" en="items" value={claims.itemCount ?? dash} />
          <Row label="البصمة" en="fingerprint" value={claims.fingerprintShort ?? dash} />
        </Section>

        {/* Corpus disclosure */}
        <Section icon={<Database className="w-5 h-5" />} title="إفصاح الذخيرة" en="Corpus disclosure" state={corpus.state} error={corpus.error}>
          <Row
            label="الإفصاح"
            en="disclosure"
            value={
              corpus.disclosure ? (
                <Badge className={corpus.disclosure === "REAL" ? "bg-emerald-600" : "bg-amber-500"}>{corpus.disclosure}</Badge>
              ) : (
                dash
              )
            }
          />
          <Row label="المصدر" en="provenance" value={corpus.provenance ?? dash} />
          <Row label="عدد الوثائق" en="docCount" value={corpus.docCount ?? dash} />
          <Row label="النطاقات" en="domains" value={corpus.domainCount ?? dash} />
          <Row label="بصمة المحتوى" en="sha256" value={corpus.sha256Short ?? dash} />
        </Section>

        {/* Truth ledger summary + row-level table (STE-K-31) */}
        <Section
          icon={<History className="w-5 h-5" />}
          title="سجل الحقيقة"
          en="Truth ledger"
          state={ledgerRows.state}
          error={ledgerRows.error}
        >
          <Row label="عدد اللقطات" en="count" value={ledger.count ?? dash} />
          <Row label="آخر بصمة" en="latest fingerprint" value={ledger.latestFingerprintShort ?? dash} />
          <Row label="وقت الالتقاط" en="capturedAt" value={ledger.capturedAt ?? dash} />
          <Row
            label="انحراف الملخص"
            en="summary drift"
            value={
              ledger.drift === null ? (
                dash
              ) : ledger.drift ? (
                <Badge variant="destructive">انحراف · DRIFT</Badge>
              ) : (
                <Badge className="bg-emerald-600">ثابت · STABLE</Badge>
              )
            }
          />
          <Row label="الثبات" en="persistence" value={ledgerRows.persistence ?? ledger.persistence ?? dash} />

          {ledgerRows.state === "EMPTY" ? (
            <p className="mt-3 text-sm text-gray-500">
              لا صفوف بعد — حالة فارغة صادقة، لا تاريخ مُلفّق. · No rows yet — honestly empty.
            </p>
          ) : (
            <div className="mt-3 overflow-x-auto">
              <table className="w-full text-sm border border-gray-200 rounded-lg overflow-hidden">
                <thead className="bg-gray-50 text-gray-600">
                  <tr>
                    <th className="px-2 py-2 text-right">المعرّف · id</th>
                    <th className="px-2 py-2 text-right">وقت الالتقاط · capturedAt</th>
                    <th className="px-2 py-2 text-right">البصمة · fingerprint</th>
                    <th className="px-2 py-2 text-right">الانحراف · drift</th>
                    <th className="px-2 py-2 text-right">حافة السجل · edge</th>
                  </tr>
                </thead>
                <tbody>
                  {ledgerRows.rows.map((r) => (
                    <tr key={`${r.id ?? "null"}-${r.capturedAt ?? "na"}`} className="border-t border-gray-100">
                      <td className="px-2 py-2 font-mono" dir="ltr">{r.id ?? dash}</td>
                      <td className="px-2 py-2 font-mono" dir="ltr">{r.capturedAt ?? dash}</td>
                      <td className="px-2 py-2 font-mono" dir="ltr">{r.fingerprintShort ?? dash}</td>
                      <td className="px-2 py-2">
                        {r.drift === null ? (
                          dash
                        ) : r.drift ? (
                          <span className="inline-flex flex-col gap-1">
                            <Badge variant="destructive">انحراف · DRIFT</Badge>
                            <span className="text-xs text-gray-500">تغيّر البصمة عن السابقة · fingerprint changed vs predecessor</span>
                          </span>
                        ) : (
                          <Badge className="bg-emerald-600">ثابت · STABLE</Badge>
                        )}
                      </td>
                      <td className="px-2 py-2">
                        <span className="inline-flex flex-col gap-1">
                          {r.predecessorPruned === true ? (
                            <>
                              <Badge className="bg-amber-500">سابقه مُقلَّم · predecessor pruned</Badge>
                              <span className="text-xs text-gray-500">الانحراف غير قابل للقياس · drift unmeasurable at this edge</span>
                            </>
                          ) : r.isGenesis === true ? (
                            <Badge variant="secondary">الأصل · GENESIS</Badge>
                          ) : r.predecessorPruned === null || r.isGenesis === null ? (
                            <span className="font-mono" dir="ltr">{dash}</span>
                          ) : (
                            <span className="font-mono" dir="ltr">{dash}</span>
                          )}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Section>

        {/* Truth-ledger bounded retention (STE-K-23) */}
        <Section icon={<Archive className="w-5 h-5" />} title="احتفاظ السجل" en="Ledger retention" state={retention.state} error={retention.error}>
          {retention.disclosed ? (
            <>
              <Row label="نافذة الاحتفاظ" en="keep (max snapshots)" value={retention.keep ?? dash} />
              <Row label="أقدم لقطة محفوظة" en="oldest retained id" value={retention.oldestRetainedId ?? dash} />
              <Row
                label="حافة النافذة"
                en="window edge"
                value={
                  retention.oldestRetainedIsGenesis === null ? (
                    dash
                  ) : retention.oldestRetainedIsGenesis ? (
                    <Badge className="bg-emerald-600">الأصل محفوظ · genesis retained</Badge>
                  ) : (
                    <Badge className="bg-amber-500">الأقدم مُقلَّم · older pruned</Badge>
                  )
                }
              />
              <p className="mt-2 text-xs text-gray-500">
                يُحتفظ بأحدث {retention.keep ?? dash} لقطة فقط، ويُقلَّم الأقدم ذرّياً وقت الالتقاط — إفصاح مقاس لا حذف صامت.
                <span className="text-gray-400"> · Newest {retention.keep ?? dash} kept; oldest pruned atomically at capture — measured, not a silent delete.</span>
              </p>
            </>
          ) : (
            <p className="text-sm text-gray-500">
              هذا النشر لا يُفصح سياسة الاحتفاظ (نشر بائت قبل الاحتفاظ المحدود). · This deployment does not disclose a retention policy (stale pre-retention deploy).
            </p>
          )}
        </Section>

        {/* Rate-limit disclosure */}
        <Section icon={<GaugeCircle className="w-5 h-5" />} title="حدّ المعدّل" en="Rate limit" state={rateLimit.state} error={rateLimit.error}>
          <Row
            label="الثبات"
            en="persistence"
            value={
              rateLimit.persistence === null ? (
                dash
              ) : (
                <Badge className={rlPersisted ? "bg-emerald-600" : "bg-amber-500"}>{rateLimit.persistence}</Badge>
              )
            }
          />
          <p className="mt-2 text-xs text-gray-500">
            {rlPersisted ? (
              <>
                حالة الدلاء مقاسة من Postgres وتصمد عبر إعادة النشر — مُشترَكة بين النسخ.
                <span className="text-gray-400"> · Bucket state measured from Postgres, survives redeploy — shared across instances.</span>
              </>
            ) : (
              <>
                العدّادات في ذاكرة كل نسخة فقط، تتصفّر عند الإقلاع — لا تُشارَك بين النسخ (ارتداد صادق).
                <span className="text-gray-400"> · Per-instance in-memory, resets on boot — not shared (honest fallback).</span>
              </>
            )}
          </p>
        </Section>

        {/* Bridge fail-closed */}
        <Section icon={<Link2 className="w-5 h-5" />} title="حالة الجسور" en="Bridges (fail-closed)" state={bridges.state} error={bridges.error}>
          {bridges.items.length === 0 ? (
            <p className="text-sm text-gray-500">لا جسور معلنة. · No bridges declared.</p>
          ) : (
            bridges.items.map((b) => (
              <Row
                key={b.id}
                label={b.id}
                en={b.enabled ? "enabled" : "locked"}
                value={
                  <Badge className={b.failClosed ? "bg-emerald-600" : "bg-gray-400"}>
                    {b.failClosed ? "مقفل بأمان · FAIL-CLOSED" : "مفتوح · OPEN"}
                    {b.hasSharedSecret ? " · keyed" : ""}
                  </Badge>
                }
              />
            ))
          )}
        </Section>

        <footer className="text-center text-xs text-gray-400 pt-2">
          قراءة فقط · Read-only · onx-intelligence
        </footer>
      </div>
    </div>
  );
}
