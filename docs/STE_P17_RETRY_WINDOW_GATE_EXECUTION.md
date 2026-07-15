# STE-P-17 Retry Window Gate Execution

**IU:** STE-P-17  
**Tier:** 2  
**Branch:** `onxos-ste01-deploy-readiness`  
**Artifact:** `onx-intelligence-clean/docs/STE_P17_RETRY_WINDOW_GATE_EXECUTION.md`

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

## 1) Live gate attempts (executed)

| Evidence ID | Gate | Executed probe | Output shape / value | Verdict |
|---|---|---|---|---|
| `EV-P17-HEAD-001` | run-backed context | direct+gateway `/health` | `ALIVE/ALIVE`, commit parity=`4bcb3e4446649de4af34763567ec19148325fd85` | `PROVEN` |
| `EV-P17-A-SECRET-001` | item A secret gate | keyless `providers.liveValidate` | error envelope `code=-32001`, `httpStatus=401`, `path=providers.liveValidate` | `UNPROVEN` |
| `EV-P17-A-KEYS-001` | item A keys gate | `providers.status` | `{validated:0, configuredUnprobed:1, missingKey:7, missingIds:"anthropic,google,groq,deepseek,qwen,llama,kimi"}` | `UNPROVEN` |
| `EV-P17-B-ARCHIVE-001` | item B archive gate | local artifact probe | `{dbPresent:false, seedPresent:false}` | `UNPROVEN` |
| `EV-P17-B-ARCHIVE-002` | item B context | `onx.selfVerify` corpus block | `{corpusRaw:22500, corpusUnique:22500, corpusPersistence:"POSTGRES", summaryCount:90, summaryCapturedAt:"2026-07-15T05:35:06.921Z"}` | `PROVEN` |

Source-state head/run for attempts: `4bcb3e4` / `29391607342` (head-matched success).

---

## 2) Gate decisions (PROVEN/UNPROVEN only)

| Gate | Decision | Atomic blocker (if UNPROVEN) | Retry UTC (new) | Probe/output anchor |
|---|---|---|---|---|
| item A secret gate | `UNPROVEN` | valid `x-onx-bridge-key` unavailable in current execution envelope | `2026-07-15T14:25:00Z` | `EV-P17-A-SECRET-001` (`-32001/401/path`) |
| item A keys gate | `UNPROVEN` | provider secrets still missing for 7 providers; validated set remains 0 | `2026-07-16T06:25:00Z` | `EV-P17-A-KEYS-001` (aggregate counts + missing ids) |
| item B archive gate | `UNPROVEN` | authentic archive artifacts still absent in repository scope | `2026-07-16T06:25:00Z` | `EV-P17-B-ARCHIVE-001` (boolean presence shape) |

---

## 3) Delta counts (P-16 -> P-17)

| Metric | Before (P-16) | After (P-17) | Delta |
|---|---:|---:|---:|
| Target gates | 3 | 3 | 0 |
| PROVEN (target set) | 0 | 0 | 0 |
| UNPROVEN (target set) | 3 | 3 | 0 |

---

## 4) Deterministic rule

No gate is upgraded to `PROVEN` unless closure succeeds through a live retry probe on a head with successful Truth Gates and headSha match.

---

## 5) Post-commit tuple (P-17)

- **Commit SHA:** `TBD`
- **Truth Gates run:** `TBD`
- **headSha matched:** `TBD`

