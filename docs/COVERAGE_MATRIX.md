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
| B2 | B2-ORCHESTRATOR | 📄 DOCUMENTED (موثق) | founder mandate spec only |
| B3 | B3-CONSTITUTION-RUNTIME | 🟡 PARTIAL (جزئي) | fail-closed services: `authority-gate.ts` (سلّم A0–A5 + سجل hash-chain مقاوم للعبث) + `ccmr.ts` (تصنيف جذر/دستور/مالك/دليل) + `cevp-guard.ts` (حفظ القوة) + `authority-router.ts`، مُثبتة بـ`api/__tests__/authority.test.ts` (fail-closed فوق A2 + كشف عبث hash-chain). معيار الدمج (`ac-b3-authority`/merge-gate) غير مغطى → **لا يُوسم منفذاً‑ومثبتاً قبل الدمج** |
| B4 | B4-INTELLIGENCE-OBJECTS | 🟡 PARTIAL (جزئي) | os-objects + mind-persistence tests; pgvector memory pending |
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

### B1 Codex Guard — CI enforcement (baseline mode)
- Deviation rules: `FORBIDDEN_LABEL`, `FAIL_OPEN`, `FAKE_LIVE_METRIC` (`api/lib/codex-guard.ts`).
- CLI: `npm run guard:scan` (all) · `-- --changed` · `-- --base=origin/main` · `-- --emit-baseline`.
- CI: `.github/workflows/codex-guard.yml` scans **changed files only** (diff vs main) + runs B0/B1 suites.
- **Baseline mode:** 16 legacy deviations (11 FORBIDDEN_LABEL, 5 FAKE_LIVE_METRIC) recorded in
  `docs/codex-guard-baseline.json` + documented in `docs/CODEX_GUARD_BASELINE.md` as tracked debt.
  They stay **reported (never muted)** but do **not** fail CI; only NEW deviations fail. Closed in a later cleanup wave.
- Test/doc files are exempt from pattern rules (regression-tested) — the guard names the labels on purpose.
