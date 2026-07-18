# STE-P-19 Next Window Gate Execution

**IU:** STE-P-19  
**Tier:** 2  
**Branch:** `onxos-ste01-deploy-readiness`  
**Artifact:** `onx-intelligence-clean/docs/STE_P19_NEXT_WINDOW_GATE_EXECUTION.md`

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

## 1) Live attempts for residual gates

| Evidence ID | Gate | Probe executed | Output | Verdict |
|---|---|---|---|---|
| `EV-P19-HEAD-001` | run-backed context | `/health` direct+gateway | `ALIVE/ALIVE` with commit parity `03cb7169ad30542877c37f9c98b950b8e2dcc7d2` | `PROVEN` |
| `EV-P19-A-SECRET-001` | item A secret gate | keyless `providers.liveValidate` | error `{code:-32001,httpStatus:401,path:"providers.liveValidate"}` | `UNPROVEN` |
| `EV-P19-A-KEYS-001` | item A keys gate | `providers.status` | `{validated:0,configuredUnprobed:1,missingKey:7,missingIds:"anthropic,google,groq,deepseek,qwen,llama,kimi"}` | `UNPROVEN` |
| `EV-P19-B-ARCHIVE-001` | item B archive gate | local artifact presence check | `{dbPresent:false,seedPresent:false}` | `UNPROVEN` |
| `EV-P19-B-ARCHIVE-002` | item B archive context | `onx.selfVerify` corpus block | `{corpusRaw:22500,corpusUnique:22500,corpusPersistence:"POSTGRES",summaryCount:92,summaryCapturedAt:"2026-07-15T05:45:06.278Z"}` | `PROVEN` |

Source-state head/run for attempts: `03cb716` / `29392227472` (head-matched success).

---

## 2) Gate decisions with blockers and next retry

| Gate | Decision | Atomic blocker | Output shape reference | Retry UTC (new) |
|---|---|---|---|---|
| item A secret gate | `UNPROVEN` | valid `x-onx-bridge-key` unavailable to this execution envelope | `EV-P19-A-SECRET-001` (`-32001/401/path`) | `2026-07-15T14:45:00Z` |
| item A keys gate | `UNPROVEN` | 7 provider keys still missing; validated providers = 0 | `EV-P19-A-KEYS-001` (aggregate + missing ids) | `2026-07-16T06:45:00Z` |
| item B archive gate | `UNPROVEN` | authentic REC-06 artifacts still absent in repo scope | `EV-P19-B-ARCHIVE-001` (presence booleans) | `2026-07-16T06:45:00Z` |

---

## 3) Delta counts (P-18 -> P-19)

| Metric | Before (P-18) | After (P-19) | Delta |
|---|---:|---:|---:|
| Residual gates | 3 | 3 | 0 |
| PROVEN (target set) | 0 | 0 | 0 |
| UNPROVEN (target set) | 3 | 3 | 0 |

---

## 4) Deterministic rule

A gate is promoted to `PROVEN` only when closure succeeds via live run-backed probe on a head with successful Truth Gates and headSha match.

---

## 5) Post-commit tuple (P-19)

- **Commit SHA:** `TBD`
- **Truth Gates run:** `TBD`
- **headSha matched:** `TBD`

