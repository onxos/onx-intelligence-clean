# STE-P-63 Next Retry Window Execution

**IU:** STE-P-63  
**Tier:** 2  
**Branch:** `onxos-ste01-deploy-readiness`  
**Artifact:** `onx-intelligence-clean/docs/STE_P63_NEXT_RETRY_WINDOW_EXECUTION.md`

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

## 1) Retry-window run-backed rows on current head

Execution UTC: `2026-07-15T13:12:42Z`  
Local current head: `31cd922a1c5a8cdca417028bb25b88bb7359d232`  
Live deployed head observed by `/health`: `31cd922a1c5a8cdca417028bb25b88bb7359d232` (same-head parity `PROVEN`)

| Evidence ID | Gate | Probe executed | Output (live) | Verdict |
|---|---|---|---|---|
| `EV-P63-HEAD-001` | run-backed context | direct+gateway `/health` | `ALIVE/ALIVE`; commit parity on deployed head=`31cd922a1c5a8cdca417028bb25b88bb7359d232` | `PROVEN` |
| `EV-P63-A-SECRET-001` | item A secret gate | `POST /api/trpc/providers.liveValidate` with current envelope | `HAS_SECRET=false`; error `code=-32001`, `httpStatus=401`, `path="providers.liveValidate"` | `UNPROVEN` |
| `EV-P63-A-KEYS-001` | item A keys gate | `GET /api/trpc/providers.status` | `validated=0`, `configuredUnprobed=1`, `missingKey=7`, ids=`anthropic,google,groq,deepseek,qwen,llama,kimi` | `UNPROVEN` |
| `EV-P63-B-ARCHIVE-001` | item B archive gate | local presence/hash probe (`onx-database.db`,`knowledge-seed-15k.json`) | `{"dbPresent":false,"seedPresent":false,"dbSha":null,"seedSha":null}` | `UNPROVEN` |
| `EV-P63-B-ARCHIVE-002` | item B archive context | `GET /api/trpc/onx.selfVerify` corpus block | `rawTotal=22500`, `uniqueByTitleBody=22500`, `persistence="POSTGRES"`, `truthLedger.count=139` | `PROVEN` |

---

## 2) Executable decisions (no promotion without new closure)

| Gate | Decision | Atomic blocker | Output shape reference | Retry UTC (updated) | Next executable action |
|---|---|---|---|---|---|
| item A secret gate | `UNPROVEN` | valid `x-onx-bridge-key` still unavailable in execution envelope | `EV-P63-A-SECRET-001` (`-32001/401/path`) | `2026-08-14T04:55:00Z` | execute one authorized `providers.liveValidate` and persist full JSON |
| item A keys gate | `UNPROVEN` | provider credentials still absent for 7 ids | `EV-P63-A-KEYS-001` (aggregate + ids list) | `2026-08-14T20:55:00Z` | run `providers.status` then authorized `providers.liveValidate` and persist both outputs |
| item B archive gate | `UNPROVEN` | authentic REC-06 artifacts still absent in repo scope | `EV-P63-B-ARCHIVE-001` (presence/hash JSON) | `2026-08-14T20:55:00Z` | run presence/hash, then ingest, then `onx.selfVerify` post-check |

No residual gate has new run-backed closure evidence in this wave; no `PROVEN` upgrade for residual target set.

---

## 3) Before/after counters + DELTA (P-62 -> P-63)

| Metric | Before (P-62) | After (P-63) | Delta |
|---|---:|---:|---:|
| Residual gates | 3 | 3 | 0 |
| PROVEN (target set) | 0 | 0 | 0 |
| UNPROVEN (target set) | 3 | 3 | 0 |

---

## 4) Post-commit tuple (P-63)

- **Commit SHA:** `TBD`
- **Truth Gates run:** `TBD`
- **headSha matched:** `TBD`
