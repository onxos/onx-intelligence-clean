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
| B2-γ | B2-CAPABILITY-FACTORY | ✅ VERIFIED (منفذ ومثبت) | مصنع القدرات المحكوم: `api/lib/capability-factory.ts` + `api/capability-factory-router.ts` + `api/__tests__/capability-factory.test.ts` (17 اختبار أخضر). حلقة مغلقة تعيد الاستخدام لا التكرار: اقتراح→**OCMBR (B0)** DOCUMENTED (دليل DOC) → تفويض **A2 عبر AuthorityGate (B3)** `decideAuthority` fail-closed (بلا موافقة مالك صريحة تبلغ A2 → DENIED، لا توليد) → توليد عبر `Executor` القابل للتبديل (mock حتمي بلا مفاتيح، **B2**) → فحص **Codex Guard (B1)** `scanText` → **تحقق مستقل** `independentlyVerify` (لا يثق بالشهادة الذاتية، يسم OVERSTATED) → ترقية بأدلة CODE/TEST/RUN مسجّلة (الحالة تُحسب لا تُعلن). **merge sha 7092aa6** (PR #42, CI green — اختبارات المصنع تعمل في بوابة codex-guard) |
| B3 | B3-CONSTITUTION-RUNTIME | ✅ VERIFIED (منفذ ومثبت) | code (`authority-gate.ts` سلّم A0–A5 fail-closed + hash-chain + `ccmr.ts` + `cevp-guard.ts` + `authority-router.ts`) + `api/__tests__/authority.test.ts` (24 اختبار: fail-closed فوق A2 + كشف عبث hash-chain) + run + **merge sha 52d4a5b** (PR #34, CI green) |
| B4 | B4-INTELLIGENCE-OBJECTS | 🟡 PARTIAL (جزئي) | code (`api/lib/intelligence-object.ts` آلة حالات حتمية 11 مرحلة سؤال→سياق→مصادر→ادعاءات→أدلة مؤيدة/معارضة→فرضيات→عدم يقين→حكم→خطة→نتيجة→تعلّم بانتقالات متحققة fail-closed + `api/lib/persistent-memory.ts` واجهة MemoryStore + تطبيق حتمي في-الذاكرة بتضمين hash وبحث cosine + محول pgvector خلف نفس الواجهة بfallback حتمي لا يرمي عند فشل pg، provenance + تصحيح + نسيان مقصود + تصدير + `api/intelligence-object-router.ts` يربط رؤى Wave 8-a بكائنات الذكاء، مسجّل تحت مفتاح `intelligenceObject` تكاملاً لا استبدالاً لـ`intelligence`) + `api/__tests__/intelligence-object.test.ts` + `api/__tests__/persistent-memory.test.ts` (31 اختبار أخضر، مربوطة في CI عبر codex-guard.yml) + run. **PARTIAL عمداً: معيار الدمج (merge sha + CI green) غير مغطى — لا يُوسم VERIFIED قبل الدمج المستقل. محول pgvector الحقيقي على قاعدة بيانات فعلية غير مُختبَر في CI (المنطق الحتمي في-الذاكرة فقط).** |
| B5 | B5-REALITY-ENGINE | 🟡 PARTIAL (جزئي) | conflict-engine + tests; full ingest→graph pending |
| B6 | B6-EVALUATION-LEARNING | 🟡 PARTIAL (جزئي) | measurement-engine + tests; golden sets/regression gates pending |
| B7 | B7-ZERO-INPUT | 🟡 PARTIAL (جزئي) | living-loop + tests; A0/A1 suggestion generator + meta metrics pending |
| B8 | B8-BRIDGE-CONTRACTS | 🟡 PARTIAL (جزئي) | bridge-guard + tests; versioned schema registry pending |

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
