# STE-P-22 External Gate Readiness Refresh

**IU:** STE-P-22  
**Tier:** 2  
**Branch:** `onxos-ste01-deploy-readiness`  
**Artifact:** `onx-intelligence-clean/docs/STE_P22_EXTERNAL_GATE_READINESS_REFRESH.md`

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

## 1) Live readiness refresh on current head

Execution UTC: `2026-07-15T06:26:30Z`  
Execution head: `0040e91c780193cda198daecfe4f5d4b27a5afe4`

| Evidence ID | Gate | Probe executed | Output (live) | Verdict |
|---|---|---|---|---|
| `EV-P22-HEAD-001` | run-backed context | direct+gateway `/health` | direct/gateway `status="ALIVE"` with commit parity=`0040e91c780193cda198daecfe4f5d4b27a5afe4` | `PROVEN` |
| `EV-P22-A-SECRET-001` | item A secret gate | `POST /api/trpc/providers.liveValidate` with current envelope | `HAS_SECRET=false`; error `code=-32001`, `httpStatus=401`, `path="providers.liveValidate"` | `UNPROVEN` |
| `EV-P22-A-KEYS-001` | item A keys gate | `GET /api/trpc/providers.status` | `validated=0`, `configuredUnprobed=1`, `missingKey=7`, ids=`anthropic,google,groq,deepseek,qwen,llama,kimi` | `UNPROVEN` |
| `EV-P22-B-ARCHIVE-001` | item B archive gate | local presence/hash probe (`onx-database.db`,`knowledge-seed-15k.json`) | `{"dbPresent":false,"seedPresent":false,"dbSha":null,"seedSha":null}` | `UNPROVEN` |
| `EV-P22-B-ARCHIVE-002` | item B archive context | `GET /api/trpc/onx.selfVerify` corpus block | `rawTotal=22500`, `uniqueByTitleBody=22500`, `persistence="POSTGRES"`, `truthLedger.count=96` | `PROVEN` |

---

## 2) Probe-contract validity check (still executable)

| Gate | Contract check | Result |
|---|---|---|
| item A secret gate | Endpoint/path and error/success envelope shape unchanged for `providers.liveValidate` | Valid and executable (currently blocked by missing caller secret) |
| item A keys gate | `providers.status` still returns provider aggregate and missing-key ids list | Valid and executable |
| item B archive gate | Presence/hash probe still executable locally; post-check via `onx.selfVerify` still returns deterministic corpus block | Valid and executable (ingest step blocked by absent artifacts) |

---

## 3) Gate decisions (no inferred closure)

| Gate | Decision | Atomic blocker | Output shape reference | Retry UTC (updated) |
|---|---|---|---|---|
| item A secret gate | `UNPROVEN` | valid `x-onx-bridge-key` unavailable to this execution envelope | `EV-P22-A-SECRET-001` (`-32001/401/path`) | `2026-07-15T16:55:00Z` |
| item A keys gate | `UNPROVEN` | 7 provider keys absent; validation still zero | `EV-P22-A-KEYS-001` (aggregate + explicit ids) | `2026-07-16T08:55:00Z` |
| item B archive gate | `UNPROVEN` | authentic REC-06 files still absent in repo scope | `EV-P22-B-ARCHIVE-001` (presence/hash JSON) | `2026-07-16T08:55:00Z` |

No gate closure evidence emerged in this wave; no promotion to `PROVEN` for residual target set.

---

## 4) Delta counts (P-21 -> P-22)

| Metric | Before (P-21) | After (P-22) | Delta |
|---|---:|---:|---:|
| Residual gates | 3 | 3 | 0 |
| PROVEN (target set) | 0 | 0 | 0 |
| UNPROVEN (target set) | 3 | 3 | 0 |

---

## 5) Post-commit tuple (P-22)

- **Commit SHA:** `TBD`
- **Truth Gates run:** `TBD`
- **headSha matched:** `TBD`

