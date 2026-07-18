# STE-P-25 Retry Window Execution

**IU:** STE-P-25  
**Tier:** 2  
**Branch:** `onxos-ste01-deploy-readiness`  
**Artifact:** `onx-intelligence-clean/docs/STE_P25_RETRY_WINDOW_EXECUTION.md`

---

## 0) Caps

| Cap | Value |
|---|---|
| MAX_AI_CREDITS | `4` |
| MAX_INPUT_TOKENS | `80000` |
| MAX_OUTPUT_TOKENS | `16000` |
| MAX_CONTEXT_TOKENS | `120000` |
| MAX_RUNTIME_MINUTES | `45` |
| MAX_RETRIES | `2` |

---

## 1) Retry-window attempts (all three residual gates)

Execution UTC: `2026-07-15T06:45:47Z`  
Execution head: `1cf8b1ee63c6473a9864efd9994852fd92723226`

| Evidence ID | Gate | Probe executed | Output (live) | Verdict |
|---|---|---|---|---|
| `EV-P25-HEAD-001` | run-backed context | direct+gateway `/health` | direct/gateway `status="ALIVE"` with commit parity=`1cf8b1ee63c6473a9864efd9994852fd92723226` | `PROVEN` |
| `EV-P25-A-SECRET-001` | item A secret gate | `POST /api/trpc/providers.liveValidate` with current envelope | `HAS_SECRET=false`; error `code=-32001`, `httpStatus=401`, `path="providers.liveValidate"` | `UNPROVEN` |
| `EV-P25-A-KEYS-001` | item A keys gate | `GET /api/trpc/providers.status` | `validated=0`, `configuredUnprobed=1`, `missingKey=7`, ids=`anthropic,google,groq,deepseek,qwen,llama,kimi` | `UNPROVEN` |
| `EV-P25-B-ARCHIVE-001` | item B archive gate | local presence/hash probe (`onx-database.db`,`knowledge-seed-15k.json`) | `{"dbPresent":false,"seedPresent":false,"dbSha":null,"seedSha":null}` | `UNPROVEN` |
| `EV-P25-B-ARCHIVE-002` | item B archive context | `GET /api/trpc/onx.selfVerify` corpus block | `rawTotal=22500`, `uniqueByTitleBody=22500`, `persistence="POSTGRES"`, `truthLedger.count=99` | `PROVEN` |

---

## 2) Gate decisions with updated retry windows

| Gate | Decision | Atomic blocker | Output shape reference | Retry UTC (updated) |
|---|---|---|---|---|
| item A secret gate | `UNPROVEN` | valid `x-onx-bridge-key` unavailable in this execution envelope | `EV-P25-A-SECRET-001` (`-32001/401/path`) | `2026-07-15T19:55:00Z` |
| item A keys gate | `UNPROVEN` | 7 provider keys still missing; validation remains zero | `EV-P25-A-KEYS-001` (aggregate + explicit ids list) | `2026-07-16T11:55:00Z` |
| item B archive gate | `UNPROVEN` | authentic REC-06 artifacts still absent in repository scope | `EV-P25-B-ARCHIVE-001` (presence/hash JSON) | `2026-07-16T11:55:00Z` |

No residual gate received new closure evidence in this wave; no `PROVEN` promotion for target set.

---

## 3) Delta counts (P-24 -> P-25)

| Metric | Before (P-24) | After (P-25) | Delta |
|---|---:|---:|---:|
| Residual gates | 3 | 3 | 0 |
| PROVEN (target set) | 0 | 0 | 0 |
| UNPROVEN (target set) | 3 | 3 | 0 |

---

## 4) Post-commit tuple (P-25)

- **Commit SHA:** `TBD`
- **Truth Gates run:** `TBD`
- **headSha matched:** `TBD`

