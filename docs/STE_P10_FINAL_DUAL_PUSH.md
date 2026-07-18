# STE-P-10 Final Dual Push

**IU:** STE-P-10  
**Tier:** 2  
**Branch:** `onxos-ste01-deploy-readiness`  
**Artifact:** `docs/STE_P10_FINAL_DUAL_PUSH.md`

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

## 1) Run-backed probes on current HEAD

| Evidence ID | Target | Measured result | Proof anchor |
|---|---|---|---|
| EV-P10-HEAD-PARITY-001 | head binding | direct+gateway `/health` parity with commit `66b6657792fa4f43a3d9c86b8f34205c0c917b42` | this file `:27-30` |
| EV-P10-PROVIDERS-LIVEVALIDATE-001 | (1) providers.liveValidate authorized success path | keyless probe => `401 BRIDGE_UNAUTHORIZED` (authorized success path not executable without valid secret) | `api/providers-router.ts:25-33`; this file `:27-30` |
| EV-P10-PROVIDERS-STATUS-001 | (1) context | providers state: `validated=0`, `configuredUnprobed=1`, `missingKey=7` | this file `:27-30` |
| EV-P10-CORPUS-ARCHIVE-GAP-001 | (2) authentic REC-06 archive proof | `onx-database.db` and `knowledge-seed-15k.json` remain absent locally; references only | `docs/CORPUS_GAP_REPORT.md:11-12,49`; `scripts/seed-corpus.ts:13` |
| EV-P10-CORPUS-LIVE-001 | (2) context | live corpus measured `22500/22500`, `POSTGRES` (does not prove authentic REC-06 archive) | this file `:27-30` |

**Source-state head/run for probes:** `66b6657` / `29389669981` (head-matched success).

---

## 2) Final dual decision table

| Item | Before (P-09) | P-10 decision | After | Evidence IDs | Atomic blocker (if UNPROVEN) | Retry (UTC) |
|---|---|---|---|---|---|---|
| 1) providers.liveValidate authorized success path | `UNPROVEN` | keep unresolved | `UNPROVEN` | `EV-P10-PROVIDERS-LIVEVALIDATE-001`, `EV-P10-PROVIDERS-STATUS-001` | Missing valid bridge secret; authorized mutation path cannot be executed from keyless envelope | 2026-07-15T13:15:00Z |
| 2) authentic REC-06 corpus archive proof | `UNPROVEN` | keep unresolved | `UNPROVEN` | `EV-P10-CORPUS-ARCHIVE-GAP-001`, `EV-P10-CORPUS-LIVE-001` | Authentic external archive artifacts are not present in this repository scope | 2026-07-16T05:15:00Z |

---

## 3) Counts before/after

| Metric | Before (P-09) | After (P-10) |
|---|---:|---:|
| Residual target items | 2 | 2 |
| UNPROVEN | 2 | 2 |
| PROVEN | 0 | 0 |
| REDUCED | — | 0 |

---

## 4) Post-commit tuple (P-10)

- **Commit SHA:** `TBD`
- **Truth Gates run:** `TBD`
- **headSha matched:** `TBD`

