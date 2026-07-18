# STE-P-09 Residual Triad Push

**IU:** STE-P-09  
**Tier:** 2  
**Branch:** `onxos-ste01-deploy-readiness`  
**Artifact:** `docs/STE_P09_RESIDUAL_TRIAD_PUSH.md`

---

## 0) Caps

| Cap | Value |
|---|---|
| MAX_AI_CREDITS | `6` |
| MAX_INPUT_TOKENS | `120000` |
| MAX_OUTPUT_TOKENS | `24000` |
| MAX_CONTEXT_TOKENS | `160000` |
| MAX_RUNTIME_MINUTES | `60` |
| MAX_RETRIES | `2` |

---

## 1) Current-head run-backed probes for triad

| Evidence ID | Triad item | Measured result | Anchor |
|---|---|---|---|
| EV-P09-HEAD-PARITY-001 | binding/context | direct+gateway `/health` = `ALIVE` with commit parity `60a6727deba49ec0894f76a0c696291f8f6aebf6` | this file `:27-31` |
| EV-P09-PROVIDERS-LIVEVALIDATE-001 | 1) authorized success path | keyless probe returns `401 BRIDGE_UNAUTHORIZED` (authorized success path still inaccessible without secret) | `api/providers-router.ts:25-33`; this file `:27-31` |
| EV-P09-PROVIDER-KEYS-STATE-001 | 2) missing provider keys evidence | `missingKey=7`, ids=`anthropic,google,groq,deepseek,qwen,llama,kimi` | this file `:27-31` |
| EV-P09-CORPUS-ARCHIVE-GAP-001 | 3) authentic REC-06 proof | archive artifacts `onx-database.db` / `knowledge-seed-15k.json` still absent locally (references only) | `docs/CORPUS_GAP_REPORT.md:11-12,49`; `scripts/seed-corpus.ts:13` |
| EV-P09-CORPUS-LIVE-001 | 3) context | live corpus present (`22500/22500`, `POSTGRES`) but this does not prove authentic REC-06 archive | this file `:27-31` |

**Source-state head/run for probes:** `60a6727` / `29389386657` (head-matched success).

---

## 2) Residual triad decision table (before/after)

| Triad item | Before (P-08) | P-09 decision | Status after | Evidence IDs | Reason if UNPROVEN | Retry (UTC) |
|---|---|---|---|---|---|---|
| 1) `providers.liveValidate` authorized success path | `UNPROVEN` | keep unresolved | `UNPROVEN` | `EV-P09-PROVIDERS-LIVEVALIDATE-001` | Atomic blocker: missing valid bridge secret for authorized path | 2026-07-15T13:05:00Z |
| 2) missing provider keys evidence | `UNPROVEN` | converted with hard runtime evidence | `PROVEN` | `EV-P09-PROVIDER-KEYS-STATE-001` | — | — |
| 3) authentic REC-06 corpus archive proof | `UNPROVEN` | keep unresolved | `UNPROVEN` | `EV-P09-CORPUS-ARCHIVE-GAP-001`, `EV-P09-CORPUS-LIVE-001` | Atomic blocker: external archive package not present in repo scope | 2026-07-16T05:05:00Z |

---

## 3) Counts before/after

| Metric | Before (P-08) | After (P-09) |
|---|---:|---:|
| Residual triad size | 3 | 3 |
| UNPROVEN items in triad | 3 | 2 |
| PROVEN items in triad | 0 | 1 |
| Newly converted to PROVEN in this wave | 0 | 1 |

---

## 4) Post-commit tuple (P-09)

- **Commit SHA:** `TBD`
- **Truth Gates run:** `TBD`
- **headSha matched:** `TBD`

