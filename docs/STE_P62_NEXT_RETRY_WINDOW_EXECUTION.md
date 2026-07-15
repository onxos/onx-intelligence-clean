# STE-P-62 Next Retry Window Execution

**IU:** STE-P-62  
**Tier:** 2  
**Branch:** `onxos-ste01-deploy-readiness`  
**Artifact:** `onx-intelligence-clean/docs/STE_P62_NEXT_RETRY_WINDOW_EXECUTION.md`

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

Execution UTC: `2026-07-15T13:01:29Z`  
Local current head: `1f41b02ca46558e596dcd5c03b72db6a9891724b`  
Live deployed head observed by `/health`: `1f41b02ca46558e596dcd5c03b72db6a9891724b` (same-head parity `PROVEN`)

| Evidence ID | Gate | Probe executed | Output (live) | Verdict |
|---|---|---|---|---|
| `EV-P62-HEAD-001` | run-backed context | direct+gateway `/health` | `ALIVE/ALIVE`; commit parity on deployed head=`1f41b02ca46558e596dcd5c03b72db6a9891724b` | `PROVEN` |
| `EV-P62-A-SECRET-001` | item A secret gate | `POST /api/trpc/providers.liveValidate` with current envelope | `HAS_SECRET=false`; error `code=-32001`, `httpStatus=401`, `path="providers.liveValidate"` | `UNPROVEN` |
| `EV-P62-A-KEYS-001` | item A keys gate | `GET /api/trpc/providers.status` | `validated=0`, `configuredUnprobed=1`, `missingKey=7`, ids=`anthropic,google,groq,deepseek,qwen,llama,kimi` | `UNPROVEN` |
| `EV-P62-B-ARCHIVE-001` | item B archive gate | local presence/hash probe (`onx-database.db`,`knowledge-seed-15k.json`) | `{"dbPresent":false,"seedPresent":false,"dbSha":null,"seedSha":null}` | `UNPROVEN` |
| `EV-P62-B-ARCHIVE-002` | item B archive context | `GET /api/trpc/onx.selfVerify` corpus block | `rawTotal=22500`, `uniqueByTitleBody=22500`, `persistence="POSTGRES"`, `truthLedger.count=138` | `PROVEN` |

---

## 2) Executable decisions (no promotion without new closure)

| Gate | Decision | Atomic blocker | Output shape reference | Retry UTC (updated) | Next executable action |
|---|---|---|---|---|---|
| item A secret gate | `UNPROVEN` | valid `x-onx-bridge-key` still unavailable in execution envelope | `EV-P62-A-SECRET-001` (`-32001/401/path`) | `2026-08-13T04:55:00Z` | execute one authorized `providers.liveValidate` and persist full JSON |
| item A keys gate | `UNPROVEN` | provider credentials still absent for 7 ids | `EV-P62-A-KEYS-001` (aggregate + ids list) | `2026-08-13T20:55:00Z` | run `providers.status` then authorized `providers.liveValidate` and persist both outputs |
| item B archive gate | `UNPROVEN` | authentic REC-06 artifacts still absent in repo scope | `EV-P62-B-ARCHIVE-001` (presence/hash JSON) | `2026-08-13T20:55:00Z` | run presence/hash, then ingest, then `onx.selfVerify` post-check |

No residual gate has new run-backed closure evidence in this wave; no `PROVEN` upgrade for residual target set.

---

## 3) Before/after counters + DELTA (P-61 -> P-62)

| Metric | Before (P-61) | After (P-62) | Delta |
|---|---:|---:|---:|
| Residual gates | 3 | 3 | 0 |
| PROVEN (target set) | 0 | 0 | 0 |
| UNPROVEN (target set) | 3 | 3 | 0 |

---

## 4) Post-commit tuple (P-62)

- **Commit SHA:** `TBD`
- **Truth Gates run:** `TBD`
- **headSha matched:** `TBD`
