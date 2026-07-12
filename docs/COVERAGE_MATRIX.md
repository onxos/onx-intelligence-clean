# Intelligence Service — Coverage Matrix

## Reflection Rules
| Rule | Name | Event Types | Insight | Tests | Status |
|------|------|-------------|---------|-------|--------|
| 1 | completed-cycle | payroll.run.* | insight-cycle-* | ✅ | COMPLETE |
| 2 | recurrence | any (pattern detection) | insight-pattern-* | ✅ | COMPLETE |
| 3 | coverage | any (domain count) | insight-coverage | ✅ | COMPLETE |
| 4 | verdict-awareness | ack-* | insight-verdicts | ✅ | COMPLETE |
| 5 | revenue-pulse | billing.invoice.created, finance.payment.received | insight-revenue-pulse | ✅ | COMPLETE |
| 6 | no-show-anomaly | crm.appointment.noshow, crm.appointment.completed | insight-anomaly-noshow | ✅ | COMPLETE |
| 7 | overdue-invoices | billing.invoice.overdue | insight-overdue-invoices | ✅ | COMPLETE |

## Actionable Insights (actionType)
| Insight Type | Action Type | Platform Handler | Status |
|--------------|-------------|-----------------|--------|
| insight-overdue-invoices | overdue_invoice_followup | decision-execute.ts | ✅ COMPLETE |
| insight-revenue-pulse | (informational) | — | INTENTIONAL |
| insight-anomaly-noshow | (informational) | — | INTENTIONAL |
| insight-cycle-* | (informational) | — | INTENTIONAL |
| insight-pattern-* | (informational) | — | INTENTIONAL |
| insight-coverage | (informational) | — | INTENTIONAL |
| insight-verdicts | (meta-loop) | — | INTENTIONAL |

## tRPC Procedures
| Router | Procedure | Status |
|--------|-----------|--------|
| health | live, ready, status, metrics, ping, bridge, platformEvents, perceptionAdapter, persistence, reflection, insightsPublic | ✅ COMPLETE |
| titan | listInsights, verdicts | ✅ COMPLETE |
| bridge | (platform events endpoint) | ✅ COMPLETE |

## Frontend Routes
| Path | Component | Status |
|------|-----------|--------|
| / | Landing | ✅ COMPLETE |
| /dashboard | Dashboard | ✅ COMPLETE |
| /titan-conclave/pulse | TitanPulse | ✅ COMPLETE |
| /revenue | Revenue | ✅ COMPLETE |
| /ask | Ask | ✅ COMPLETE |
| ... (15 total) | All pages | ✅ ALL COMPLETE |

## Environment Variables
| Variable | Required | Default | Purpose |
|----------|----------|---------|----------|
| APP_ID | ✅ | — | Application identifier |
| APP_SECRET | ✅ | — | Application secret |
| BRIDGE_ENABLED | No | false | Enable platform bridge |
| BRIDGE_SHARED_SECRET | If bridge | — | Bridge auth (min 32 chars) |
| DATABASE_URL | No | sqlite:///app/db/onx-pilot.db | Database connection |
| KIMI_AUTH_URL | No | https://auth.kimi.com | Kimi AI provider |
| KIMI_OPEN_URL | No | https://open.kimi.com | Kimi AI provider |
| OWNER_UNION_ID | No | '' | Kimi owner ID |
| OPENAI_API_KEY | No | '' | OpenAI provider |
| NODE_ENV | No | development | Environment |

## Gaps (Documented Intentional)
| Gap | Reason | Action |
|-----|--------|--------|
| Email/SMS channels | No external provider key | Documented in founder keys table; mail service in platform |
| Only 1/7 insights actionable | Others are informational monitoring | Intentional design; more actions = future feature |

## Civilizational Mind — Program Ledger (OCMBR / B0)
Maturity is **computed from evidence** by `api/lib/ocmbr-engine.ts` — never declared.
Five states: منفذ ومثبت (VERIFIED) · جزئي (PARTIAL) · Demo (DEMO) · موثق (DOCUMENTED) · مفقود (MISSING).
Source of truth: `caller.ocmbr.matrix()` (seeded from `api/lib/ocmbr-seed.ts`).

| Program | Capability code | Computed state | Evidence |
|---------|-----------------|----------------|----------|
| B0 | B0-OCMBR | ✅ VERIFIED (منفذ ومثبت) | code + `api/__tests__/ocmbr.test.ts` + run + **merge sha 5028c3a** (PR #32, CI green) |
| B1 | B1-CODEX-GUARD | ✅ VERIFIED (منفذ ومثبت) | code + `api/__tests__/codex-guard.test.ts` + run + **merge sha 5028c3a** (PR #32, CI green) |
| B2 | B2-ORCHESTRATOR | ✅ VERIFIED (منفذ ومثبت) | code (`orchestrator-engine.ts` دورة mandate→موجات مغلقة→executor قابل للتبديل→**تحقق مستقل يرفض الشهادة الذاتية** ويسم OVERSTATED عبر B1 + حاكم ميزانية + استئناف متعثر + `orchestrator-store.ts` + `orchestrator-router.ts`) + `api/__tests__/orchestrator.test.ts` (26 اختبار: رفض الموجة المفتوحة، REJECTS lying/OVERSTATED، إيقاف الميزانية، استئناف المتعثر، دورة كاملة، tRPC) + run + **merge sha 4bd6de1** (PR #35, CI green) |
| B2-β | B2-METHODS-LIBRARY | ✅ VERIFIED (منفذ ومثبت) | سجل مناهج بيانات (لا prompts): `api/lib/methods-library.ts` + `api/methods-library-router.ts` + `api/__tests__/methods-library.test.ts` (44 اختبار أخضر يعمل في بوابة CI). 8 مناهج كسجلات بقواعد قابلة للفحص (منها 3 تشغيلية: git-hygiene, push-early-often, independent-bisect) + `requireMethod` + `verifyMethodCompliance` يعيد استخدام حارس B1 (`scanFiles`) + fail-closed + **merge sha 4b3ad3b** (PR #38, CI green) + **merge sha c32b685** (PR #40, CI green — اختبارات المكتبة صارت جزءاً من codex-guard workflow) |
| B2-γ | B2-CAPABILITY-FACTORY | ✅ VERIFIED (منفذ ومثبت) | مصنع القدرات المحكوم: `api/lib/capability-factory.ts` + `api/capability-factory-router.ts` + `api/__tests__/capability-factory.test.ts` (20 اختبار أخضر). حلقة مغلقة تعيد الاستخدام لا التكرار: اقتراح→**OCMBR (B0)** DOCUMENTED (دليل DOC) → تفويض **A2 عبر AuthorityGate (B3)** `decideAuthority` fail-closed (بلا موافقة مالك صريحة تبلغ A2 → DENIED، لا توليد) → توليد عبر `Executor` القابل للتبديل (mock حتمي بلا مفاتيح، **B2**) → فحص **Codex Guard (B1)** `scanText` → **تحقق مستقل** `independentlyVerify` (لا يثق بالشهادة الذاتية، يسم OVERSTATED) → ترقية بأدلة CODE/TEST + تشغيل مستقل منفصل لكل معيار (الحالة تُحسب لا تُعلن). **merge sha 7092aa6** (PR #42, CI green — اختبارات المصنع تعمل في بوابة codex-guard). **قيد evidence-granularity محلول (C1)**: الترقية باتت تُجري تشغيل تحقق مستقل منفصل لكل معيار وتسجّل دليل RUN موسوماً بـ`criterionId` من مخرج ذلك التشغيل وحده — fail-closed ذرّي لأي معيار بلا `verifyCommand` أو يفشل تحققه (لا ترقية جزئية). الدليل DOC التاريخي محفوظ في السجل + دليل DOC حل ناجح (PR #56 = `536d297`، سجل خام run 29167549210 = 20/20) — قيد محلول |
| B3 | B3-CONSTITUTION-RUNTIME | ✅ VERIFIED (منفذ ومثبت) | code (`authority-gate.ts` سلّم A0–A5 fail-closed + hash-chain + `ccmr.ts` + `cevp-guard.ts` + `authority-router.ts`) + `api/__tests__/authority.test.ts` (24 اختبار: fail-closed فوق A2 + كشف عبث hash-chain) + run + **merge sha 52d4a5b** (PR #34, CI green) |
| B4 | B4-INTELLIGENCE-OBJECTS | ✅ VERIFIED (منفذ ومثبت) | code (`api/lib/intelligence-object.ts` آلة حالات حتمية 11 مرحلة سؤال→سياق→مصادر→ادعاءات→أدلة مؤيدة/معارضة→فرضيات→عدم يقين→حكم→خطة→نتيجة→تعلّم بانتقالات متحققة fail-closed + `api/lib/persistent-memory.ts` واجهة MemoryStore + تطبيق حتمي في-الذاكرة بتضمين hash وبحث cosine + محول pgvector خلف نفس الواجهة بfallback حتمي لا يرمي عند فشل pg، provenance + تصحيح + نسيان مقصود + تصدير + `api/intelligence-object-router.ts` يربط رؤى Wave 8-a بكائنات الذكاء، مسجّل تحت مفتاح `intelligenceObject` تكاملاً لا استبدالاً لـ`intelligence`) + `api/__tests__/intelligence-object.test.ts` + `api/__tests__/persistent-memory.test.ts` (31 اختبار أخضر، مربوطة في CI عبر codex-guard.yml) + run. **merge sha e446178** (PR #44, CI green — أجنحة B4 مربوطة في بوابة codex-guard). **قيد محلول (pg-adapter-untested)**: `api/__tests__/pg-adapter-integration.test.ts` يعمل ضد Postgres+pgvector حي في CI (job `pg-adapter-integration` بservice container pgvector/pgvector:pg16، PR #55 = `8baa559`، سجل خام run 29166975569 = 5/5 بلا skip) — دليل DOC ناجح بمرجع الحل في السجل، والدليل التاريخي باقٍ |
| B5 | B5-REALITY-ENGINE | ✅ VERIFIED (منفذ ومثبت) | محرك الواقع — PR #49 مدموج (squash sha `4d46de4`، CI أخضر واختبارات B5 مربوطة في بوابة codex-guard): code (`api/lib/reality-engine.ts` مسار حتمي كامل بلا مفاتيح/DB: ingest→تنظيف→استخراج كيانات/علاقات (ثلاثية صريحة/pipe/copula عربي+إنجليزي بيقين استخراج متدرّج)→ontology (وسم المسندات المجهولة، لا قبول صامت)→knowledge graph→كشف تناقضات؛ لكل حقيقة ثقة (موثوقية المصدر × يقين الاستخراج) + نطاق صلاحية (from/to/domain). التناقض يُكشف فقط عند تداخل النطاقات — الحقائق المُقيَّدة زمنياً/مجالياً تتعايش. الحسم عبر تسلسل الحوكمة `resolveConflict` (امتداداً لـ`conflict-engine.ts` القائم، أساسٌ امتدّ إليه B5 لا استبدالاً) عند توفر مستوى، وإلا بالثقة، وإلا UNRESOLVED (fail-closed). `RealityEngine` يخزّن الحقائق بـprovenance عبر MemoryStore (B4) مع تصحيح/نسيان مقصود/تصدير + تشابه حتمي عبر deterministicEmbedding (B4) + ربط التناقضات بكائنات الذكاء (B4) تكاملاً لا تكراراً) + `api/reality-engine-router.ts` مسجّل تحت مفتاح `realityEngine` + `api/__tests__/reality-engine.test.ts` (39 اختبار أخضر في CI، سجل خام مؤكد run 29151376343). تحقق مستقل سطري + دليل COMMIT في السجل (`ac-b5-merged`) |
| B6 | B6-EVALUATION-LEARNING | ✅ VERIFIED (منفذ ومثبت) | التقييم والتعلم — PR #53 مدموج (squash sha `0fcc410`، CI أخضر واختبارات B6 مربوطة في بوابة codex-guard): `api/lib/evaluation-learning.ts` (محرك تقييم حتمي بلا مفاتيح/DB: `runGoldenSet` يشغّل مجموعات ذهبية عبر مشغّلات مسجّلة ويحسب accuracy/precision/recall/F1 + `computeCalibration` منحنى معايرة بـ5 صناديق و ECE + `regressionGate` بوابة انحدار fail-closed تقارن بخط أساس مجمّد وتسمّي كل حالة ذهبية انكسرت — لا عتبات صامتة، غياب الأساس = رفض + `recordEvaluationEvidence` يسجّل كل تشغيل كدليل RUN في OCMBR (B0) + إعادة استخدام `classifyProgress` من measurement-engine للاتجاه) + `api/lib/golden-sets.ts` (بيانات ذهبية حتمية + خطوط أساس مجمّدة لأربع قدرات مدموجة فعلياً، مشغّلاتها تستدعي الدوال الحقيقية إعادةَ استخدامٍ لا تكراراً: B1 `scanText`، B8 `validateEvent`، B2-β `verifyMethodCompliance`، B4 judge بثقة حقيقية→معايرة؛ البذر عبر `seedInstitutionalSchemas` الـidempotent بلا أي API اختباري في مسار الإنتاج) + `api/evaluation-learning-router.ts` مسجّل تحت مفتاح `evaluationLearning` + `api/__tests__/evaluation-learning.test.ts` (14 اختباراً أخضر في CI، سجل خام مؤكد run 29153344198). تحقق مستقل سطري + دليل COMMIT في السجل (`ac-b6-merged`) |
| B7 | B7-ZERO-INPUT | ✅ VERIFIED (منفذ ومثبت) | المدخل الصفري المقيد — PR #51 مدموج (squash sha `99b575d`، CI أخضر واختبارات B7 مربوطة في بوابة codex-guard): code (`api/lib/zero-input.ts` مولّد اقتراحات حتمي بلا مفاتيح/DB مبني فوق أنماط `api/living-loop.ts` امتداداً لا استبدالاً: يحوّل مخرجات الطبقات المدموجة إلى إشارات — تناقضات B5 (`signalFromContradiction`: المحسوم→A1، UNRESOLVED→A2)، أحكام B4 (`signalFromJudgment`: SUPPORTED/REFUTED→A1، INCONCLUSIVE→A0)، أنماط أحداث B8 (`signalFromEventPattern`: دون العتبة→A1، عندها/فوقها→A2 بنيوي) — ثم يصنّف كل اقتراح عبر AuthorityGate الفعلي (B3): `classifyStatus` بسقف صارم A1، أي إجراء فوق A1 → REQUIRES_APPROVAL ولا مسار تنفيذ إطلاقاً (`autoExecutable` ثابتة false، fail-closed). كل اقتراح يُسجَّل بـprovenance إلزامي عبر MemoryStore (B4) مع تصدير تدقيقي؛ التغذية الراجعة (قبول/رفض) تمنع التكرار وتُنتج مقاييس ميتا حتمية: الدقة (accuracy)، معايرة الثقة (calibration buckets LOW/MODERATE/HIGH)، والانحراف (drift) — إعادةَ استخدامٍ للطبقات لا تكراراً) + `api/zero-input-router.ts` مسجّل تحت مفتاح `zeroInput` + `api/__tests__/zero-input.test.ts` (26 اختبار أخضر في CI، سجل خام مؤكد run 29152563934). تحقق مستقل سطري + دليل COMMIT في السجل (`ac-b7-merged`) |
| B8 | B8-BRIDGE-CONTRACTS | ✅ VERIFIED (منفذ ومثبت) | عقود الجسر الموحدة — PR #47 مدموج (squash sha `0c4b6a5`، CI أخضر واختبارات B8 مربوطة في بوابة codex-guard): `api/lib/bridge-contracts.ts` + `api/bridge-contracts-router.ts` + 24 اختباراً في `api/__tests__/bridge-contract.test.ts`. سجل مخططات مُصدَّر (versioned schema registry): نسخ متعددة متعايشة، أحدث نسخة افتراضياً، عقود غير قابلة للتعديل (إعادة تعريف متعارضة تُرفض) + تحقق كامل fail-closed لكل الأنواع المؤسسية الـ22 (نوع مجهول/نسخة مجهولة/حقل مطلوب ناقص/نوع خاطئ → مرفوض) + سجل نشاط موحد بprovenance عبر MemoryStore (B4) إعادةَ استخدامٍ لا تكراراً (الأحداث غير الصالحة لا تُسجَّل، الإعادة idempotent) + ربط الإدراك يعيد استخدام `toPerceptionObject` النقي. تحقق مستقل سطري + دليل COMMIT في السجل (`ac-b8-merged`) |
| G1+G4 | G1-INGEST-CONTRACT | 🟡 PARTIAL (جزئي — على الفرع، لا يُوسم VERIFIED قبل الدمج) | إغلاق مسار الاستقبال الحي بعقود B8: `api/titan-bridge-router.ts` mutation `ingestEvent` كانت تتحقق بzod شكلياً فقط ثم `insertEvent` مباشرة — تتجاوز عقود B8 (نوع مجهول/حقل identity ناقص يدخل الـinbox بصمت). الإصلاح يمرّر كل حدث حي عبر بوابة fail-closed **تعيد استخدام** `validateEvent` (B8) لا تكرّرها: `admitLiveEvent` الجديدة في `bridge-contracts.ts` تبذر المخططات المؤسسية بشكل idempotent (`seedInstitutionalSchemas`) ثم تشغّل `validateEvent` وتحسب الرفض عبر `rejectedCount` نفسه في B8 (لا محاسبة مكرّرة)؛ و`ingestThroughBridgeContract` المستخرجة في الراوتر ترفض قبل الوصول للـstore وتُبقي شكل رد النجاح `{accepted,duplicate,id}` مضيفةً حقول الرفض فقط. اختبارات contract replay في `api/__tests__/bridge-ingest-contract.test.ts` (9 اختبارات، مربوطة كخطوة CI صريحة «Bridge Ingest Contract test suite (G1+G4)») تحاكي حرفياً payload المرسل الحقيقي (intelligence-forwarder) وتثبت: (أ) 4 أنواع مؤسسية حقيقية تمر v1، (ب) نوع غير مسجّل/حقل identity ناقص/نوع خاطئ يُرفض، (ج) مسار ingest نفسه يرفض ولا يستدعي الـstore إطلاقاً. معيار `ac-g1-ingest-contract` — لا يُرقّى قبل دمج المنسق |

> **قاعدة الميثاق:** «منفذ ومثبت / VERIFIED» = CI أخضر **+ مدموج في main**. B0/B1
> حملا معيار `ac-b*-merged`، وبعد الدمج (squash sha `5028c3a`) سُجِّل دليل COMMIT
> يغطّيه، فتخرّجا إلى **منفذ ومثبت** بأثر مُتحقَّق مستقلاً — لا شهادة ذاتية مسبقة.

### B0/B1 tRPC surface
| Router | Procedures | Status |
|--------|-----------|--------|
| ocmbr | matrix, summary, capability, registerCapability, addUnit, addCriterion, recordEvidence, seed | ✅ COMPLETE |
| codexGuard | scan, scanText, evaluateClaim | ✅ COMPLETE |
| orchestrator | createMandate, run, runTask, reassignStragglers, report, decisions | ✅ COMPLETE (branch) |
| methodsLibrary | list, get, verify | ✅ COMPLETE (branch) |

### B2 ONX Orchestrator — coordinator methodology as a deterministic runtime
- Core loop (exact order): mandate → **closed** wave map (every wave has a
  pre-defined exit gate; open maps rejected by `planMandate`) → dispatch via a
  swappable `Executor` interface (deterministic **mock**, keyless; `llm-gateway`
  hook with mock fallback; `human`) → **independent verification** →
  reasoned accept/reject decision → neutrality decision log.
- **Independent verification (charter-critical):** an executor's self-
  certification is **never** trusted. `independentlyVerify` re-inspects the
  ACTUAL output itself — substring/equality/length, a recomputed
  `stableHash` (SHA analogue), and a re-scan with **Codex Guard (B1)** for
  charter deviations — then scores the claim with B1's `evaluateClaim`. A
  false "done" is REJECTED and flagged `OVERSTATED`.
- **Three-structure integration (reuse, not rebuild):** each mandate is
  registered in the **OCMBR (B0)** ledger as a capability whose acceptance
  criteria are the wave exit gates; independent verification writes the
  covering CODE/TEST/RUN evidence, so the mandate's maturity is **computed**
  by B0 (never declared). Verification reuses **Codex Guard (B1)**.
- **Budget governor:** per-mandate cost cap; a projected breach triggers an
  immediate **halt** (no silent continuation); consumption is reported.
- **Straggler resumption:** timed-out / failed / rejected tasks are detected
  and reassigned by an explicit policy (escalating to `human` after repeated
  failure), then retried.
- **Honest reporting:** the report separates **PROVEN** (independently
  verified) from **CLAIMED** (self-certified but unproven), and surfaces the
  OCMBR-computed ledger state.
- Files: `api/lib/orchestrator-engine.ts` (pure core, no I/O) ·
  `api/lib/orchestrator-store.ts` (in-memory + `__resetOrchestratorForTests`) ·
  `api/orchestrator-router.ts` (tRPC) · `api/__tests__/orchestrator.test.ts`.
- Proof: 26 tests incl. full mock-executor cycle, **false self-certification
  rejection**, budget halt, and straggler reassign-then-verify.
- **Merge-gate:** «منفذ ومثبت / VERIFIED» only after CI-green squash-merge to
  main. Not self-certified before merge.

### B2-β Methods Library — governed methodology registry (data, not prompts)
- **Data records, not free prompts:** each approved method is a `Method`
  record (`id` + `title` + `description` + declarative `rules[]`) whose rules
  are PROGRAMMATICALLY-checkable, not prose (`api/lib/methods-library.ts`).
- **The five approved methods:** `tdd-mandatory` (test-before/with-code + a
  test file per code file), `subagent-driven` (exclusive file ownership per
  scope; overlap detected), `root-cause-tracing` (documented root cause before
  any fix), `adr` (a decision carries a full ADR: context/decision/
  consequences), `standard-git` (PR size ≤ limit, Co-authored-by trailer, no
  self-merge, no charter deviations).
- **Enforcement:** `requireMethod(id, target?)` attaches a method to a task/
  worker and yields the concrete rules to satisfy; an unknown method throws
  `MethodError` (fail-closed).
- **Verification (reuse, not rebuild):** `verifyMethodCompliance(method,
  workerOutputs)` inspects the worker's ACTUAL outputs against the declared
  method and returns `{compliant, violations[]}`. The `no-charter-deviations`
  rule REUSES **Codex Guard (B1)** `scanFiles` — a forbidden label / deviation
  in a worker file becomes a violation. Fail-closed: unknown method or missing
  input → safe REJECT.
- Files: `api/lib/methods-library.ts` (pure core, no I/O) ·
  `api/methods-library-router.ts` (tRPC) · `api/__tests__/methods-library.test.ts`.
- Proof: 30 tests incl. TDD reject/accept, ownership-overlap reject, root-cause
  reject, ADR field-completeness, standard-git gates, **codex-guard reuse**, and
  fail-closed. Full suite green (`vitest run --maxWorkers=2`: 42 files / 607).
- **Merge-gate:** «منفذ ومثبت / VERIFIED» only after CI-green squash-merge to
  main. Not self-certified before merge.


- Deviation rules: `FORBIDDEN_LABEL`, `FAIL_OPEN`, `FAKE_LIVE_METRIC` (`api/lib/codex-guard.ts`).
- CLI: `npm run guard:scan` (all) · `-- --changed` · `-- --base=origin/main` · `-- --emit-baseline`.
- CI: `.github/workflows/codex-guard.yml` scans **changed files only** (diff vs main) + runs B0/B1 suites.
- **Baseline mode:** 16 legacy deviations (11 FORBIDDEN_LABEL, 5 FAKE_LIVE_METRIC) recorded in
  `docs/codex-guard-baseline.json` + documented in `docs/CODEX_GUARD_BASELINE.md` as tracked debt.
  They stay **reported (never muted)** but do **not** fail CI; only NEW deviations fail. Closed in a later cleanup wave.
- Test/doc files are exempt from pattern rules (regression-tested) — the guard names the labels on purpose.
