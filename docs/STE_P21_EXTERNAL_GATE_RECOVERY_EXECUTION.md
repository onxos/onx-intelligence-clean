# STE-P-21 External Gate Recovery Execution

**IU:** STE-P-21  
**Tier:** 2  
**Branch:** `onxos-ste01-deploy-readiness`  
**Artifact:** `onx-intelligence-clean/docs/STE_P21_EXTERNAL_GATE_RECOVERY_EXECUTION.md`

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

## 1) Live recovery execution (all three gates)

Execution UTC: `2026-07-15T06:19:22Z`  
Execution head: `bc8932af1dc7cfd111134f8e6f74048f5fbf1cbf`

| Evidence ID | Gate | Probe executed | Output (live) | Verdict |
|---|---|---|---|---|
| `EV-P21-HEAD-001` | run-backed context | direct+gateway `/health` | direct/gateway `status="ALIVE"` and commit parity=`bc8932af1dc7cfd111134f8e6f74048f5fbf1cbf` | `PROVEN` |
| `EV-P21-A-SECRET-001` | item A secret gate | `POST /api/trpc/providers.liveValidate` with current envelope | `HAS_SECRET=false`; error `code=-32001`, `httpStatus=401`, `path="providers.liveValidate"` | `UNPROVEN` |
| `EV-P21-A-KEYS-001` | item A keys gate | `GET /api/trpc/providers.status` | `validated=0`, `configuredUnprobed=1`, `missingKey=7`, missing ids=`anthropic,google,groq,deepseek,qwen,llama,kimi` | `UNPROVEN` |
| `EV-P21-B-ARCHIVE-001` | item B archive gate | local REC-06 artifact presence + hash probe | `{"dbPresent":false,"seedPresent":false,"dbSha":null,"seedSha":null}` | `UNPROVEN` |
| `EV-P21-B-ARCHIVE-002` | item B archive context | `GET /api/trpc/onx.selfVerify` corpus block | `rawTotal=22500`, `uniqueByTitleBody=22500`, `persistence="POSTGRES"`, `truthLedger.count=95` | `PROVEN` |

---

## 2) Gate decisions (PROVEN/UNPROVEN only)

| Gate | Decision | Atomic blocker (if UNPROVEN) | Output shape reference | Retry UTC (new) |
|---|---|---|---|---|
| item A secret gate | `UNPROVEN` | valid `x-onx-bridge-key` unavailable in current execution envelope (`HAS_SECRET=false`) | `EV-P21-A-SECRET-001` (`-32001/401/path`) | `2026-07-15T15:55:00Z` |
| item A keys gate | `UNPROVEN` | 7 provider keys still missing; provider validation remains zero | `EV-P21-A-KEYS-001` (aggregate + missing ids list) | `2026-07-16T07:55:00Z` |
| item B archive gate | `UNPROVEN` | authentic REC-06 artifacts still absent in repo scope | `EV-P21-B-ARCHIVE-001` (presence/hash JSON) | `2026-07-16T07:55:00Z` |

---

## 3) Recovery action execution status vs P-20 contracts

| Gate | P-20 recovery action | P-21 execution result |
|---|---|---|
| item A secret gate | Execute controlled authorized `providers.liveValidate` and persist output | Executed probe; remained unauthorized under current envelope (`UNPROVEN`) |
| item A keys gate | Provision keys then `providers.status` + authorized `liveValidate` | Executed status probe; keys still externally missing (`UNPROVEN`) |
| item B archive gate | Deliver files + SHA-256 + ingest + post-check | Executed presence/hash probe; files absent so ingest path blocked (`UNPROVEN`) |

---

## 4) Delta counts (P-20 -> P-21)

| Metric | Before (P-20) | After (P-21) | Delta |
|---|---:|---:|---:|
| Residual gates | 3 | 3 | 0 |
| PROVEN (target set) | 0 | 0 | 0 |
| UNPROVEN (target set) | 3 | 3 | 0 |

---

## 5) Promotion rule lock

A residual gate is promoted to `PROVEN` only with new live run-backed closure evidence on current head and successful Truth Gates with headSha match.

---

## 6) Post-commit tuple (P-21)

- **Commit SHA:** `TBD`
- **Truth Gates run:** `TBD`
- **headSha matched:** `TBD`

