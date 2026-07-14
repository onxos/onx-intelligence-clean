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
| G1+G4 | G1-INGEST-CONTRACT | ✅ VERIFIED (منفذ ومثبت) | إغلاق مسار الاستقبال الحي بعقود B8 — PR #62 مدموج (**merge sha `bbe0e7f`**، كل الفحوص SUCCESS، سجل خام مؤكد run 29183222064: خطوة «Bridge Ingest Contract test suite (G1+G4)» = 9/9): `admitLiveEvent` في `bridge-contracts.ts` تعيد استخدام `validateEvent` (B8) لا تكرّرها وتبذر المخططات idempotent وتحسب الرفض عبر `rejectedCount` نفسه؛ `ingestThroughBridgeContract` في `titan-bridge-router.ts` ترفض قبل الوصول للـstore (اختبارات تؤكد `store.calls.length === 0` على كل حالة رفض) وتُبقي شكل `{accepted,duplicate,id}`. تحقق مستقل سطري + دمج بعد مراجعة المنسق الأعلى (`ac-g1-ingest-contract`) |
| K4 | K4-GOVERNED-METHODS | 🟡 PARTIAL (جزئي — على الفرع، لا يُوسم VERIFIED قبل الدمج) | ربط مناهج B2-β فعلياً بدورة الـOrchestrator (B2) — PR #64: `TaskSpec.methodId` اختياري لكن fail-closed مرتين: `planMandate` يستدعي `requireMethod` (منهج مجهول يفشل الخطة قبل أي تنفيذ) و`runTask` بعد `independentlyVerify` يشغّل `verifyMethodCompliance` على دليل يُجمَع من **مصدر مستقل** (`registerMethodEvidenceSource` — مصنوعات repo/CI/PR/runtime خارج المنفذ): `methodOutput` المرفق من المنفذ يُسجَّل كغير موثوق ويُتجاهَل (نفس فلسفة `claimedComplete` — لا شهادة ذاتية)؛ لا مصدر مسجّل أو دليل أجوف (`{}`/مجموعات فارغة) → REJECTED. منهجا `code-review` و`test-fixing` الجديدان يفرضان مطابقة per-ref مؤرّخة: كل MERGE يحتاج REVIEW مطابق الـref قبله/معه، كل FIX يحتاج RUN استنساخ قبله + دليل TEST، وغياب التاريخ = رفض. اختبارات: methods-library 60 (منها 7 anti-self-certification) + orchestrator 34 (منها 8 K4) + خطوة CI مخصصة «Governed Methods Enforcement (K4)» بفلاتر `-t` تثبت تشغيلها. معيار `ac-k4-governed-methods` — لا يُرقّى قبل دمج المنسق الأعلى |
| K1 | K1-DEEP-RESEARCH | 🟡 PARTIAL (جزئي — على الفرع، لا يُوسم VERIFIED قبل الدمج) | حلقة البحث العميق المتكرر: `api/lib/deep-research.ts` قدرة بحثية حتمية بلا مفاتيح/شبكة بخمس حالات صريحة — **plan** (سؤال → قائمة استعلامات فرعية **مغلقة** عند التخطيط، لا توسع runtime؛ سؤال فارغ → `EMPTY_QUESTION` fail-closed) → **collect** (عبر **provider port** قابل للحقن `SourceProvider` **مملوك للخادم**؛ الراوتر لا يقبل fixtures من العميل — `makeUnavailableProvider`/`makeDemoProvider` حتميان، لا شبكة) → **validate** (fail-closed: اكتمال الحقول، اتساق التاريخ مقابل `now`، عتبة موثوقية موثقة؛ المصدر الناقص/الضعيف/المستقبلي يُستبعد ويُعدّ) → **contradict** (**إعادة استخدام B5** `runRealityPipeline`/`detectContradictions` — لا منطق تناقض جديد) → **report** (كل ادعاء مربوط بمعرفات مصادره؛ **الاستشهاد إلزامي**؛ التناقضات غير المحسومة تُعرض ولا تُخفى). حوكمة الخادم: الساعة مملوكة للخادم fail-closed بلا زمن افتراضي (`NO_CLOCK`، حُذف EPOCH)، سقف صلب للعمق `MAX_DEPTH_HARD_CAP` (3) وللمصادر `MAX_TOTAL_SOURCES` (500)، `sourceHash` SHA-256 لكل مصدر في التقرير، وحقل `providerStatus` صريح (`live`/`demo`/`unavailable`). `api/deep-research-router.ts` مسجّل تحت مفتاح `deepResearch` + `api/__tests__/deep-research.test.ts` (33 اختبار أخضر، مربوطة كخطوة CI صريحة «Deep Research test suite (K1)»). معيار `ac-k1-deep-research` — لا يُرقّى قبل دمج المنسق |

> **قاعدة الميثاق:** «منفذ ومثبت / VERIFIED» = CI أخضر **+ مدموج في main**. B0/B1
> حملا معيار `ac-b*-merged`، وبعد الدمج (squash sha `5028c3a`) سُجِّل دليل COMMIT
> يغطّيه، فتخرّجا إلى **منفذ ومثبت** بأثر مُتحقَّق مستقلاً — لا شهادة ذاتية مسبقة.

### الفجوات التشغيلية (Operational Gaps)
جدول مستقل عن مرآة السجل أعلاه (التي تُحسب من `ocmbr-seed.ts`). هذه بنود تسدّ
فجوات تكامل حقيقية بين المنصات؛ حالتها **جزئية (PARTIAL)** على الفرع حتى يتحقق
المنسق مستقلاً ويدمج ويرقّي السجل — لا يُوسم أي منها VERIFIED ذاتياً قبل الدمج.

| البند | النطاق | الحالة | الدليل |
|-------|--------|--------|--------|
| G3 | عقود B8 لأحداث منصة التسويق (onx-marketing-platform) | 🟡 PARTIAL (فرع onxos-g3-marketing-contracts) | `api/lib/marketing-contracts.ts` يسدّ الفجوة: كانت أحداث منصة التسويق تعبر جسر `/perception/records` بمغلف `PlatformEventEnvelope` الحرفي بلا عقد B8 (B8 يغطي الأنواع المؤسسية الـ22 من onx-mono فقط). إعادة استخدام B8 لا تكرار: `seedMarketingSchemas` يسجّل عقود v1 canonical لسبعة أنواع (`marketing.creative.published` / `campaign.launched` / `campaign.paused` / `approval.requested` / `approval.rejected` / `agent_task.failed` / `error.occurred`) عبر `registerSchema`؛ `marketingEnvelopeToBridgeEvent` يحوّل المغلف الحرفي إلى `BridgeEvent` بخريطة صريحة raw→canonical **fail-closed** (نوع خام مجهول/مصدر أجنبي/حقل هوية ناقص/زمن غير ISO → رفض لا تخمين، لا يصل المتجر). **تصلّب الإدماجية**: `eventId` مشتق من `recordId` عبر **SHA-256 مقصوص إلى 52-bit** — **حيدة معلنة عن نص «مفتاح ≥128-bit» الحرفي** يفرضها قيد bigint/safe-integer في Postgres؛ الحماية الفعلية ضد الفقدان ليست عرض الـhash بل **مقارنة recordId المخزَّن**: أسوأ حالة تصادم = خطأ `MarketingIdempotencyCollisionError` صريح (409) **يبعث معه إشارة تشغيلية بنيوية** (`emitMarketingCollisionSignal`: `console.error` بـsource+eventId+traceId+recordId المخزَّن/الوارد) تجعل التصادم مرئياً للمشغّل لا للمُستدعي فقط — لا إسقاط صامت ولا فجوة إتاحة خفية (اختباران حتميان: يحقن hash مُصادِماً عمداً يثبت المسار → 409، ويثبت انبعاث الإشارة البنيوية). **recordId المُقارَن هو معرّف المُصدِّر الطبيعي في المغلف (مستقل تماماً عن الهاش المقصوص — لا دائرية)**. إعادة نفس recordId → idempotent حقيقي بلا إشارة. **وصلٌ بالinbox الحقيقي**: `marketingLiveIngest` يكتب في نفس `onx_platform_event_inbox` الذي تقرأه العقول (عبر `insertEvent` المحقون) لا سجل B8 المعزول فقط، مع قراءة `getInboxRecordIdByEventId` لكشف التصادم (الفهرس الفريد يرفض أولاً فالصف مُثبَّت مُلتزَم عند القراءة — لا سباق؛ إعادة استخدام payload JSONB، لا تغيير مخطط). **مستقبِل مُصادَق محدود المعدل**: `handleMarketingIngest` (نقي، قابل للاختبار) + mutation إنتاجي `titan.ingestMarketingEvent` يعيد استخدام `assertBridgeAccess` (x-onx-bridge-key، fail-closed) + `rateLimiter` **بمفتاح منفصل `marketing:<workspaceId>`** لا يستهلك حصة ingestEvent العامة. **manifest مقترن للمنتِج**: `MARKETING_EVENT_TYPE_MAP` مجمّد + `assertMarketingManifestCoverage`. مربوط في CI عبر خطوة «Marketing Event Contracts test suite (G3)» + `api/__tests__/marketing-contracts.test.ts` (35 اختباراً: تحويل fail-closed، تصادم إدماجية محقون، مصادقة/حد معدل منفصل، وصول الinbox، اقتران manifest). **الفجوة المتبقية**: المصافحة الحية مع منصة التسويق الفعلية (عبر-ريبو + أسرار) لا تعمل في CI؛ **معيار الدمج + المصافحة الحية غير مغطيين عمداً — PARTIAL حتى دمج المنسق وترقيته في السجل (لا يُرقّى VERIFIED إلا بعد المصافحة التي يشغّلها المنسق الأعلى)** |

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

---

# STE-01 Deploy-Readiness Wave Matrix (STE-K-01 … K-17)

> Distinct series from the B/G/K civilizational ledger above. These are the
> STE-01 deploy-readiness waves executed on branch `onxos-ste01-deploy-readiness`
> (never main). Each row: wave → primary files → tests → CI gate/contract → live
> proof. Every SHA is `git log`-verified on the branch; live proofs were captured
> against the Render production deployment `https://onx-intelligence-clean.onrender.com`.
> **Doctrine:** floors are pinned at the MEASURED truth, never the wished one; an
> absent resource is reported honestly (UNAVAILABLE / EMPTY / DEMO), never faked.

## Six permanent CI gates (`.github/workflows/truth-gates.yml`)
| # | Gate | Command | Proves |
|---|------|---------|--------|
| 1 | TypeScript build | `npm run check` (`tsc -b`) | zero type errors across app + server |
| 2 | Full test suite | `npm test` (`vitest run`) | 1088 passed / 5 skipped / 0 failed |
| 3 | Codex Guard | `npm run guard:scan` | zero NEW charter deviations (15 legacy tracked) |
| 4 | OSVA self-verify | `npm run verify:self` | honest self-audit fingerprint, measured≥asserted |
| 5 | Golden eval ratchet | `npm run eval:golden` | intent/refusal/retrieval floors held at 1.0×3 |
| 6 | Corpus integrity | `npm run verify:corpus` | committed manifest matches measured seed sha256 |

## Wave rows
| Wave | Commit | Primary files | Tests | Gate / contract | Live proof |
|------|--------|---------------|-------|-----------------|------------|
| STE-K-01 (W7) BM25 ranked retrieval | `1b1d259` | `api/lib/corpus-search.ts`, `api/corpus-query-router.ts` (rankedSearch) | `corpus-search` suite | (pre-gates) CI green | `corpusQuery.rankedSearch` live |
| STE-K-02 (W9) no-key intent engine (SAFE) | `8f59747` | `api/lib/intent-engine.ts` | `intent-engine` suite | deterministic, keyless | `intentEngine` classify live |
| STE-K-03 (W10) chronological truth ledger | `b697a5c` | `api/lib/truth-ledger.ts`, `api/onx-router.ts` | `truth-ledger` suite | drift detection | `onx.truthHistory` live |
| STE-K-04 (W11) cited answer composer | `605e11d` | `api/lib/answer-composer.ts`, `api/ask-router.ts` | `answer-composer` suite | DEMO disclosure + citations | `ask.onx` live |
| STE-CI-02 (W12) Truth Gates workflow | `2f7313e` | `.github/workflows/truth-gates.yml` | — | **the 5→6 gate charter** | CI runs on every push |
| STE-K-05 (W13) rate-limit guard | `7f4e027` | `api/lib/rate-limiter.ts` + public-surface wiring | `rate-limiter` suite | 429 + PER_INSTANCE_UNPERSISTED disclosure | health/commit exempt, bridge untouched |
| STE-K-06 (W14) golden eval harness | `e9d419b` | `api/fixtures/golden-set.ts`, `api/lib/eval-harness.ts`, `api/fixtures/eval-floors.json`, `scripts/eval-golden.ts` | `eval-harness` suite + coverage | **5th gate `eval:golden`** | run 29263025255 (5 gates) |
| STE-K-07 (W15) close gaps + ratchet 1.0 | `810700e` | golden-set + intent lexicon (negative signals) | +anti-overfit cases | floors → 1.0/1.0/1.0 | run 29265169353 |
| STE-K-08 (W16/16b) live smoke contract | `4b7e0ca`, `1345f8c` | `scripts/smoke-live.ts`, `api/lib/smoke-contracts.ts` | `smoke-live` suite (mocked fetch) | 7→8 contracts, NOT in CI (network) | 7/7 live vs production |
| STE-K-09 (W17) EXPECTED_SHA alias | `8719257` | `scripts/smoke-live.ts` | smoke suite | commit freshness assertion | live 8/8 |
| STE-K-10 (W18) corpus honesty upgrade path | `cae8cbb` | `api/lib/corpus-manifest.ts`, `scripts/verify-corpus.ts`, `corpus-manifest.json` | `corpus-content-manifest` suite | **6th gate `verify:corpus`** | run 29274311582 (6 gates) |
| STE-K-11 (W19) live corpus-truth contract | `87c66e2` | `smoke-contracts.ts` (corpus_manifest_truth) | +injected-manifest tests | 8th contract | 8/8 live, sha match |
| STE-K-12 (W20) operator consolidation + env scan | `91a4d2c` | `docs/OPERATIONS_RUNBOOK.md` | — (docs) | env truth scan | DATABASE_URL SELECT 1 → HEALTHY |
| STE-K-13 (W21) truth-ledger ops audit | `c7a1800` | `smoke-contracts.ts` (truth_ledger_read), runbook | +ledger-read tests | 9th contract | empty-honest reported |
| STE-K-14 (W22) live cron capture | `9be1e74` | `api/lib/truth-snapshot-cron.ts`, `api/boot.ts` | cron tests (non-fatal, cadence) | hourly capture | first prod snapshot id=1 fp=bb642469 |
| STE-K-15 (W23) drift over time + surface | `bc009ef` | `truth-ledger.ts` (summarizeTruthLedger), `onx-router.ts`, `smoke-contracts.ts` | +drift-integrity tests | count≥2 chronology + drift integrity | count=2, truthLedgerSummary live |
| STE-K-16 (W24) DEMO→REAL upgrade code | `efa1bf0` | `api/lib/corpus-upgrade.ts`, `scripts/ingest-corpus.ts` | `corpus-upgrade` (7 tests) | validate + measured flip | `ingest:corpus` preview → REAL standalone |
| STE-K-17 (W25) public Truth page | `8080198` | `api/lib/truth-page-model.ts`, `src/pages/Truth.tsx`, `/truth` route | `truth-page-model` (10 tests) | no_key_leak extended to /truth (9th fetch) | GET /truth 200, 9/9 live, no leak |
| STE-K-18 (W26) coverage matrix + status refresh | `b2bdcbc` | `docs/COVERAGE_MATRIX.md`, `docs/OPERATIONS_RUNBOOK.md`, `.env.example` | — (docs) | 6 gates green | run 29303273279 (6 gates) |
| STE-K-19 (W27) rate-limit Postgres persistence | `82d713f` | `api/lib/rate-limiter.ts` (onx_rate_limit_buckets, postgresStore, decideRateLimit), `smoke-contracts.ts`, 5 callsites | `rate-limiter` (+6 injected-store tests) | rate_limit_disclosure accepts both modes + `EXPECT_RL_PERSISTENCE` | run 29304450986; live `POSTGRES_PERSISTED` measured |
| STE-K-20 (W28) single-origin gateway smoke | `01c18a1` | `smoke-contracts.ts` (gatewayBaseUrl, DEFAULT_GATEWAY_ORIGIN, GATEWAY_APP_MOUNT), `scripts/smoke-live.ts` (GATEWAY_ORIGIN), runbook و.9 | `smoke-live` (+4 gateway tests) | deepening — same 9 contracts, 2nd origin | run 29305502934; 9/9 via `onx-gateway…/intelligence` |
| STE-K-21 (W29) coverage matrix K-18…K-20 + status refresh | `7e083ff` | `docs/COVERAGE_MATRIX.md`, `docs/OPERATIONS_RUNBOOK.md` و.8, `.env.example` | — (docs) | 6 gates green | run 29306118608 (6 gates) |
| STE-K-22 (W30) bounded truth-ledger retention | `db9f5e5` | `api/lib/truth-ledger.ts` (LEDGER_RETENTION_KEEP=168, atomic prune tx, RetentionDisclosure, markPrunedEdge), `smoke-contracts.ts` | `truth-ledger` (+5), `smoke-live` (+6) | deepening — 9th contract validates retention + pruned-edge; total stays 9 | run 29307328642; live `retention keep=168 oldestRetainedId=1 (genesis retained)` |
| STE-K-23 (W31) deepen /truth: retention + rate-limit persistence | `42d59d4` | `api/lib/truth-page-model.ts` (RetentionSection, buildRetention), `src/pages/Truth.tsx` (retention card, measured rate-limit badge; stale caption fix) | `truth-page-model` (+6) | no new contract — rides scanned selfVerify; total stays 9 | run 29308227314; /truth 200, retention+POSTGRES_PERSISTED cards live |
| STE-K-24 (W32) coverage matrix K-21…K-23 + status refresh | `dfe4d21` | `docs/COVERAGE_MATRIX.md`, `docs/OPERATIONS_RUNBOOK.md` | — (docs) | 6 gates green | run 29308644836 (6 gates) |
| STE-K-25 (W33) /truth render proof in no_key_leak | `f638194` | `api/lib/smoke-contracts.ts` (assertTruthPageRendered; folded into 9th contract), `api/__tests__/smoke-live.test.ts` (LIVE_TRUTH_HTML aligned to built shell), runbook pointer | `smoke-live` (+8: 3 runSmoke + 5 pure-fn) | deepening — same 9 contracts; no_key_leak now proves SPA root + built bundle | run 29309499837; live `RENDER_PROVEN=true`, 9/9 strict, detail `/truth render-proven` |
| STE-K-26 (W34) unified docs wave K-24/K-25 | `8658d65` | `docs/COVERAGE_MATRIX.md`, `docs/OPERATIONS_RUNBOOK.md` | — (docs) | 6 gates green | run 29309943161 (6 gates) |
| STE-K-27 (W35) /truth deploy-freshness card from /commit | `b5363f1` | `api/lib/truth-page-model.ts` (CommitData, FreshnessSection, buildFreshness), `src/pages/Truth.tsx` (commitSiblingUrl, freshness card), `api/__tests__/truth-page-model.test.ts` | `truth-page-model` (+4) | deepening — /truth + /commit already in 9 contracts; total stays 9 | run 29310913038; live commit `b5363f1`, /truth freshness card + 9/9 strict |
| STE-K-28 (W36) unified docs wave K-26/K-27 | `cb9848c` | `docs/COVERAGE_MATRIX.md`, `docs/OPERATIONS_RUNBOOK.md` | — (docs) | 6 gates green | run 29311534451 (6 gates) |
| STE-K-29 (W37) scheduled live truth watchdog | `c6e3026` | `.github/workflows/live-truth.yml`, `docs/OPERATIONS_RUNBOOK.md`, `docs/COVERAGE_MATRIX.md` | — (ops workflow + docs) | **IMPLEMENTED_BUT_INERT_ON_GOVERNED_BRANCH** — deepening only (same 9 contracts), no EXPECT_COMMIT in cron | truth-gates run 29312071048 green; watchdog mode measured 9/9 via `GATEWAY_ORIGIN` locally; actual workflow runs blocked until default-branch availability |
| STE-K-30 (W38) watchdog constraint truth correction | `d722cb6` | `docs/OPERATIONS_RUNBOOK.md`, `docs/COVERAGE_MATRIX.md` | — (docs) | 6 gates green | run 29312565358 (6 gates) |
| STE-K-31 (W39) /truth truth-ledger row table | `6e995f7` | `api/lib/truth-page-model.ts` (truthHistory rows model), `src/pages/Truth.tsx` (human-readable table + honest badges), `api/__tests__/truth-page-model.test.ts`, docs | `truth-page-model` (+6 injected row-state tests) | deepening — /truth already scanned, truthHistory already in 9 contracts; total stays 9 | run 29313702273; strict gateway 9/9 @ `EXPECT_COMMIT=6e995f7` |

| STE-K-32 (W40) unified docs wave K-30/K-31 + measured refresh | `6dd0735` | `docs/COVERAGE_MATRIX.md`, `docs/OPERATIONS_RUNBOOK.md` | — (docs) | 6 gates green | run 29314403487 (6 gates) |
| STE-K-33 (W41) golden eval expansion (DEMO-derived) | `7d6853a` | `api/fixtures/golden-set.ts` (+8 cases), `api/fixtures/eval-floors.json`, `docs/OPERATIONS_RUNBOOK.md`, `docs/COVERAGE_MATRIX.md` | `eval:golden` (49→57 cases, ratchet kept 1.0×3) | deepening — no new contract; same eval gate + same 9 smoke contracts | run 29316271117 (6 gates); strict gateway 9/9 @ `EXPECT_COMMIT=7d6853a` |
| STE-K-34 (W42) docs-only hardening + measured refresh | `cdce921` | `docs/COVERAGE_MATRIX.md`, `docs/OPERATIONS_RUNBOOK.md` | — (docs-only; no logic, no new cases) | deepening — no new contracts; total remains 9 | pre-write live measure: `/commit=7d6853aa…`, truth-ledger `count=27 persistence=POSTGRES`; run 29318134048 (6 gates); strict gateway 9/9 @ `EXPECT_COMMIT=cdce921` |
| STE-K-35 (W43) /truth SPA render-guard architectural judgment | `055e6c2` | `docs/OPERATIONS_RUNBOOK.md`, `docs/COVERAGE_MATRIX.md` | — (docs+judgment only) | deepening — HTML-only guard for cards/tables is architecturally non-measurable on SPA; data-layer guards remain the truthful path; total stays 9 | measured raw `/truth` HTML: `len=400`, `root=true`, `module=true`, `freshnessText=false`, `ledgerText=false`; run 29319606159 (6 gates); strict gateway 9/9 @ `EXPECT_COMMIT=055e6c2` |
| STE-K-36 (W44) activate K-35 judgment via data-layer guard deepening | `425cc05` | `api/lib/smoke-contracts.ts`, `api/__tests__/smoke-live.test.ts`, `docs/OPERATIONS_RUNBOOK.md`, `docs/COVERAGE_MATRIX.md` | `smoke-live` (+4 deterministic truth_ledger_read row-schema tests; suite 1084→1088) | deepening — strengthened 9th contract (`truth_ledger_read`) for table-consumed fields; total stays 9 | run 29321877107 (6 gates); strict gateway 9/9 @ `EXPECT_COMMIT=425cc05` |
| STE-K-37 (W45) docs-only consolidation: SPA data-layer guard doctrine | `d7eba7e` | `docs/COVERAGE_MATRIX.md`, `docs/OPERATIONS_RUNBOOK.md` | — (docs-only; tests remain 1088) | deepening documentation only — no new contracts; total stays 9 | pre-write live measure: `/health commit=425cc05d003a…`, `truth_ledger_read count=20 persistence=POSTGRES`; strict gateway 9/9 @ `EXPECT_COMMIT=425cc05`; run 29322658607 (6 gates) |
| STE-K-38 (W46) measured judgment: truthHistory count semantics (C-41 mirror) | `1f7b2c9` | `docs/COVERAGE_MATRIX.md`, `docs/OPERATIONS_RUNBOOK.md` | — (docs-only; tests remain 1088) | measured judgment + docs correction only — no new contracts; total stays 9 | run 29323493568 (6 gates); strict gateway 9/9 @ `EXPECT_COMMIT=1f7b2c9`; measured `20/34/34` |
| STE-K-39 (W47) activate K-38 via total-count coherence guard | `8169151` | `api/lib/smoke-contracts.ts`, `api/__tests__/smoke-live.test.ts`, `docs/COVERAGE_MATRIX.md`, `docs/OPERATIONS_RUNBOOK.md` | `smoke-live` (+2 deterministic tests; suite 1088→1090) | deepening — same 9 contracts; enforce `truthLedgerSummary.count` presence + total≥window coherence | run 29325490217 (6 gates); strict gateway 9/9 @ `EXPECT_COMMIT=8169151`; live guard detail proved total count=36 |
| STE-K-40 (W48) docs-only measured refresh + milestone #124 reflection | `4d43ebe` | `docs/COVERAGE_MATRIX.md`, `docs/OPERATIONS_RUNBOOK.md` | — (docs-only; tests remain 1090) | docs-only refresh — no new contracts; total remains 9 | run 29326419506 (6 gates); strict gateway 9/9 @ `EXPECT_COMMIT=4d43ebe`; measured `window=20 / total=37` |
| STE-K-41 (W49) measured judgment: drift cross-row coherence guard | `223be9b` | `docs/COVERAGE_MATRIX.md`, `docs/OPERATIONS_RUNBOOK.md` | — (docs-only; tests remain 1090) | measured judgment — guard already enforced in existing 9th contract; total stays 9 | run 29327051165 (6 gates); strict gateway 9/9 @ `EXPECT_COMMIT=223be9b` |
| STE-K-42 (W50) golden eval expansion round 2 (DEMO-derived) | `b58ced1` | `api/fixtures/golden-set.ts` (+8 cases), `docs/COVERAGE_MATRIX.md`, `docs/OPERATIONS_RUNBOOK.md` | `eval:golden` (57→65 cases, ratchet stays 1.0×3) | deepening — no new contract; same eval gate + same 9 smoke contracts | run 29327773343 (6 gates); pre-commit `eval:golden` FAIL كشف صياغة weak (`rt-strategy` hit RESULTS) ثم صياغة مصححة؛ final pre-commit PASS (`65/65`, retrieval `18/18`); strict gateway 9/9 @ `EXPECT_COMMIT=b58ced1` |
| STE-K-43 (W51) docs-only freeze for golden round-2 | `9f82038` | `docs/COVERAGE_MATRIX.md`, `docs/OPERATIONS_RUNBOOK.md` | — (docs-only; tests remain 1090) | docs-only freeze — no new contracts; total remains 9 | run 29328186171 (6 gates); strict gateway 9/9 @ `EXPECT_COMMIT=9f82038`; pre-write live measure: `/health commit=b58ced1c174b…`; `selfVerify.truthLedgerSummary.count=39 (POSTGRES)` |
| STE-K-44 (W52) measured judgment: fingerprint recomputation guard scope | `5a17cce` | `docs/COVERAGE_MATRIX.md`, `docs/OPERATIONS_RUNBOOK.md` | — (docs-only; tests remain 1090) | measured judgment — no new contract; total stays 9 (non-measurable edge documented) | run 29328920794 (6 gates); strict gateway 9/9 @ `EXPECT_COMMIT=5a17cce`; public `truthHistory` summary-only means full payload recomputation non-measurable on live surface |
| STE-K-45 (W53) unit guard for K-44 non-measurable edge | `39529e5` | `api/__tests__/self-verify.test.ts`, `docs/COVERAGE_MATRIX.md`, `docs/OPERATIONS_RUNBOOK.md` | `self-verify.test.ts` (+1 deterministic unit test; suite 1090→1091) | deepening in unit layer only — no new contract; total stays 9 | run 29329347856 (6 gates); strict gateway 9/9 @ `EXPECT_COMMIT=39529e5`; independent in-test recomputation matches `report.fingerprint` |
| STE-K-46 (W54) measured claims-coherence guard on selfVerify | `151ed03` | `api/lib/smoke-contracts.ts`, `api/__tests__/smoke-live.test.ts`, `docs/COVERAGE_MATRIX.md`, `docs/OPERATIONS_RUNBOOK.md` | `smoke-live.test.ts` (suite 1091→1092) | deepening inside existing `honest_status_selfverify` contract only; total stays 9 | contract now enforces claims counters coherence with items array (measured/asserted derivation) + boolean measured flags; deterministic forged-counter failure injected; run 29329924346 (6 gates); strict gateway 9/9 @ `EXPECT_COMMIT=151ed03` |
| STE-K-47 (W55) docs-only freeze for K-46 claims-coherence activation | `ff9b67f` | `docs/COVERAGE_MATRIX.md`, `docs/OPERATIONS_RUNBOOK.md` | — (docs-only; tests remain 1092) | docs-only freeze; no logic change, no new contracts; total remains 9 | run 29330469878 (6 gates); strict gateway 9/9 @ `EXPECT_COMMIT=ff9b67f`; pre-write live measure captured on served K-46 commit (`/health commit=151ed03…`, `truthLedgerSummary.count=43`); doctrine K-44→K-45→K-46 consolidated |
| STE-K-48 (W56) measured judgment: retention prune logic already unit-guarded | `6861b3b` | `docs/COVERAGE_MATRIX.md`, `docs/OPERATIONS_RUNBOOK.md` | — (docs-only; tests remain 1092) | measured judgment only; no new contracts; total stays 9 | prune path already covered by deterministic unit contracts (atomic BEGIN/INSERT/DELETE/COMMIT, OFFSET keep=168, pruned edge naming, drift edge honesty); live prune remains non-measurable until count>168; run 29330927150 (6 gates); strict gateway 9/9 @ `EXPECT_COMMIT=6861b3b` |
| STE-K-49 (W57) measured freshness guard for latest truth snapshot | `bfbf4a4` | `api/lib/smoke-contracts.ts`, `api/__tests__/smoke-live.test.ts`, `docs/COVERAGE_MATRIX.md`, `docs/OPERATIONS_RUNBOOK.md` | `smoke-live.test.ts` (suite 1092→1093) | deepening inside existing `truth_ledger_read` contract only; total stays 9 | cadence measured as hourly (`TRUTH_SNAPSHOT_INTERVAL_MS`); contract now fails honest on stale latest snapshot age (> 2× cadence + explicit margin); deterministic stale fixture added; run 29331683069 (6 gates); strict gateway 9/9 @ `EXPECT_COMMIT=bfbf4a4` |
| STE-K-50 (W58) docs-only freeze for K-48/K-49 measured doctrine | `337c079` | `docs/COVERAGE_MATRIX.md`, `docs/OPERATIONS_RUNBOOK.md` | — (docs-only; tests remain 1093) | docs-only freeze; no logic change, no new contracts; total remains 9 | run 29332469979 (6 gates); strict gateway 9/9 @ `EXPECT_COMMIT=337c079`; pre-write live measure on served K-49 commit: `/health=bfbf4a4`, `truthLedgerSummary.count=46`, latest `truthHistory.createdAt=2026-07-14T12:15:08.145Z` (age≈10m) |
| STE-K-51 (W59) docs-only reflection block for milestones #127..#131 | `d7cd4f3` | `docs/COVERAGE_MATRIX.md`, `docs/OPERATIONS_RUNBOOK.md` | — (docs-only; tests remain 1093) | docs-only reflection/freeze; no logic change, no new contracts; total remains 9 | run 29333327926 (6 gates); strict gateway 9/9 @ `EXPECT_COMMIT=d7cd4f3`; pre-write live measure on served K-50 commit: `/health=337c079`, `truthLedgerSummary.count=47`, latest `truthHistory.createdAt=2026-07-14T12:30:09.183Z` (age≈7m); permanent tri-repo reflection block added |
| STE-K-52 (W60) measured /health payload honesty guard deepening | `aaf8a22` | `api/lib/smoke-contracts.ts`, `api/__tests__/smoke-live.test.ts`, `docs/COVERAGE_MATRIX.md`, `docs/OPERATIONS_RUNBOOK.md` | `smoke-live.test.ts` (suite 1093→1094) | deepening inside existing `health_live` contract only; total stays 9 | contract now enforces sha-like commit format, allowed env set, non-negative uptime, and parseable/non-future timestamp (skew-tolerant); deterministic negative tests added; run 29333973727 (6 gates); strict gateway 9/9 @ `EXPECT_COMMIT=aaf8a22` |
| STE-K-53 (W61) docs-only freeze for K-52 health-payload doctrine | `b7c219c` | `docs/COVERAGE_MATRIX.md`, `docs/OPERATIONS_RUNBOOK.md` | — (docs-only; tests remain 1094) | docs-only freeze; no logic change, no new contracts; total remains 9 | run 29335260931 (6 gates); strict gateway 9/9 @ `EXPECT_COMMIT=b7c219c`; pre-write live measure on served commit: `/health=b7c219c`, `status=ALIVE`, `env=production`, `truthLedgerSummary.count=50 (POSTGRES)`, latest `truthHistory.createdAt=2026-07-14T13:10:11.013Z` (age≈4m) |
| STE-K-54 (W62) measured truthHistory row-structure coherence deepening | `6ece183` | `api/lib/smoke-contracts.ts`, `api/__tests__/smoke-live.test.ts`, `docs/COVERAGE_MATRIX.md`, `docs/OPERATIONS_RUNBOOK.md` | `smoke-live.test.ts` (suite 1094→1095) | deepening inside existing `truth_ledger_read` contract only; total stays 9 | measured gap: contract validated row types/order but did not enforce requested page limit; activation now fails honest when returned rows exceed requested `limit`; deterministic failure test added; run 29336331282 (6 gates); strict gateway 9/9 @ `EXPECT_COMMIT=6ece183` |
| STE-K-55 (W63) docs-only freeze for K-54 row-structure doctrine | `(this wave commit)` | `docs/COVERAGE_MATRIX.md`, `docs/OPERATIONS_RUNBOOK.md` | — (docs-only; tests remain 1095) | docs-only freeze; no logic change, no new contracts; total remains 9 | pre-write live measure on served K-54 commit: `/health=6ece183`, `status=ALIVE`, `env=production`, `truthLedgerSummary.count=52 (POSTGRES)`, latest `truthHistory.createdAt=2026-07-14T13:30:06.073Z` (age≈2m) |

## Live measured status (as of W63 pre-write measurement / commit `6ece183`)
- **/health:** `ALIVE`, `env=production`, pre-write live commit `6ece183` (measured via strict live gateway before committing K-55 docs freeze).
- **Official single origin (STE-K-20):** `main` retired from live service; every surface is
  reached through the gateway `https://onx-gateway.onrender.com`. MEASURED proxy map:

  | Path via gateway | Measured | Upstream rewrite |
  |---|---|---|
  | `/api/intelligence/v1/health` | **404** | assumed path is wrong |
  | `/api/intelligence/trpc/<proc>` | 200 | `/api/*` mount → upstream `/api/trpc/<proc>` (tRPC only) |
  | `/intelligence/health` · `/commit` · `/truth` | **200** | full-app mount → app root (no rewrite) |
  | `/intelligence/api/trpc/<proc>` | 200 | full-app → `/api/trpc/<proc>` |

  The full-app mount `…/intelligence` is the ONE base serving all nine contracts; live 9/9
  via the single origin.
- **Truth ledger (STE-K-38/K-39 measured semantics):** `onx.truthHistory.count` is the **response window size**
  (bounded by `limit`, default 20), not the global table total. Live measurement:
  `truthHistory(limit=20) => count=20` and the independent total surface
  `onx.selfVerify.truthLedgerSummary.count => 52`.
- **Latest snapshot freshness (STE-K-49 live measure):**
  latest `truthHistory.snapshots[0].createdAt = 2026-07-14T13:30:06.073Z` with
  measured age `≈2` minutes at pre-write measurement time.
- **K-39 data-layer activation:** smoke deepening now enforces that `truthLedgerSummary.count`
  is a present non-negative integer and that total ≥ returned window rows (`onx.truthHistory`).
- **Truth-ledger retention (STE-K-22):** bounded at **keep=168** (7 days hourly), pruned
  atomically at capture. MEASURED disclosure live on `onx.truthHistory` / `truthLedgerSummary`:
  `{keep:168, oldestRetainedId:1, oldestRetainedIsGenesis:true}` — the 168 retention window is not yet
  reached (total retained snapshots currently 52), so genesis is honestly retained; measured pruning begins past 168.
- **K-41 drift coherence judgment (measured from code+tests):** cross-row `drift` semantics are already guarded
  where measurable: for each visible predecessor pair, contract enforces `drift === (fp[i] !== fp[i+1])`;
  the unmeasurable edge (oldest row with predecessor خارج النافذة/مُقلَّم) remains explicitly named via
  `predecessorPruned` with `drift=false` (honest non-measurable edge).
- **/truth page:** LIVE (HTTP 200), rendered entirely from honest surfaces, zero key leak.
  Surfaces (STE-K-23) a bounded-retention card (keep / oldestRetainedId / genesis-retained
  vs older-pruned edge) and a MEASURED rate-limit persistence badge — the stale hard-coded
  "per-instance in-memory" caption that contradicted the K-19 measured store was removed.
  Surfaces (STE-K-27) a deploy-freshness card measured from `/commit` (served commit + bootTime,
  SourceOutcome OK/EMPTY/FETCH_FAILED with null-honest fields, no fabricated buildTime).
  Surfaces (STE-K-31) a human-readable truth-ledger row table from `truthHistory` (id, capturedAt,
  short fingerprint, drift, predecessorPruned, genesis) so row-level edge honesty is visible, not
  hidden in API-only payloads.
  **Render-proven (STE-K-25):** the 9th live check (`no_key_leak`) now also proves the served
  page is the REAL built SPA shell — measured markers `id="root"` + `<script type="module"
  src="/assets/…">`; a hollow 200 shell or non-200 fails honestly. Live `RENDER_PROVEN=true`;
  contract detail reads `/truth render-proven (SPA root + built bundle)`.
- **STE-K-35 architectural judgment (measured):** raw `/truth` HTML on production SPA carries
  only shell markers (`id="root"` + module bundle) and **does not** carry card/table content text
  (`freshness=false`, `ledger=false`). Therefore guarding freshness/ledger presence from raw HTML
  is non-measurable in this architecture; truthful guarding remains at the data layer
  (`truthHistory`/`truth-ledger` + `/commit`) through existing contracts (total stays 9).
- **STE-K-36 practical activation:** contract `truth_ledger_read` now enforces row fields consumed
  by the human table (`id/capturedAt/fingerprint/drift/predecessorPruned/genesis-edge` semantics)
  directly from live API payloads. This operationalizes K-35's judgment without adding contracts
  (still 9).
- **Corpus:** `disclosure=DEMO` (measured) — 22500 templated seed docs, sha256
  `6fc2bed87d86…`; awaits the founder REC-06 authentic archive (19,012 docs) to flip
  to REAL **by measurement**, never by hand.
- **Bridges:** fail-closed, 401 `BRIDGE_UNAUTHORIZED` on keyless ingest.
- **Rate limit:** **`POSTGRES_PERSISTED`** measured live (STE-K-19) — bucket state in
  `onx_rate_limit_buckets` via a `SELECT … FOR UPDATE` transaction, survives redeploy;
  honest per-window fallback to `PER_INSTANCE_UNPERSISTED` (memory) if the DB is unreachable.
  Surfaced as a measured badge on /truth (STE-K-23).
- **Golden floors:** 1.0 / 1.0 / 1.0 (intentAccuracy / refusalHonesty / retrievalHit) over
  **65 measured cases** (expanded 49→57 in STE-K-33 ثم 57→65 في STE-K-42) —
  a ratchet, never lowered.
- **Live watchdog (STE-K-29):** implemented, but **inert on the governed branch** because
  GitHub Actions executes both `schedule` and `workflow_dispatch` for a workflow file only
  when that file exists on the default branch. Semantics remain honest by design (`EXPECT_COMMIT`
  intentionally unset; any contract breach would fail red), but activation requires one of:
  founder-approved narrow main exception (#117), merge-to-default, or external scheduler.
  This is operational deepening, not a new contract (total stays 9).
- **Milestone #119 (single-origin API truth, tri-repo):** completed across the three repos.
  Intelligence continues to prove all nine doctrine contracts through the gateway single origin;
  marketing web remains architecturally excluded by #118.

## Environment truth (post K-14…K-55, `.env.example`)
All values MEASURED by `process.env` reads in code; none fabricated. See
`docs/OPERATIONS_RUNBOOK.md` §و (environment truth scan) for the file:line inventory.
No new **server-read** environment variable was introduced by K-14…K-55 — the cron capture,
DEMO→REAL tooling, Truth page, rate-limit persistence, bounded retention, single-origin gateway
proof, the /truth retention/rate-limit deepening, the /truth render proof, the /truth
deploy-freshness card, the /truth truthHistory row table, and the STE-K-33 golden-set expansion all
reuse existing surfaces and the existing `BRIDGE_SHARED_SECRET` / `DATABASE_URL` inputs. STE-K-29
adds only a GitHub workflow env
(`GATEWAY_ORIGIN`) consumed by the CI runner process for `npm run smoke:live`; it is NOT a new
server-side env read.
Two K-19/K-20 variables are **operator-tooling-only, NOT read by the running server** — both
consumed solely by `scripts/smoke-live.ts`:
- `GATEWAY_ORIGIN` (STE-K-20) — official gateway origin; derives the single-origin smoke base.
- `EXPECT_RL_PERSISTENCE` (STE-K-19) — asserts the deployment's rate-limit backing store.
- **STE-K-55 grep-verified (changed files only):** `process.env` ظهرت داخل نصوص
  توثيق/أمثلة فقط (`docs/COVERAGE_MATRIX.md`, `docs/OPERATIONS_RUNBOOK.md`) ولا توجد
  إضافة لأي قراءة env تشغيلية جديدة في كود الخادم.
