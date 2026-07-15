# STE-P-15 Gate Closure Pack

**IU:** STE-P-15  
**Tier:** 2  
**Branch:** `onxos-ste01-deploy-readiness`  
**Artifact:** `onx-intelligence-clean/docs/STE_P15_GATE_CLOSURE_PACK.md`

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

## 1) Gate-closure attempts executed (live)

| Evidence ID | Gate | Executed probe | Output |
|---|---|---|---|
| `EV-P15-HEAD-001` | run-backed context | direct/gateway `/health` | `ALIVE/ALIVE`, commit parity=`72efda77411097642ba74a02b5fed8434eab3631` |
| `EV-P15-A-SECRET-001` | item A secret gate | keyless `providers.liveValidate` retry | error envelope: `code=-32001`, `httpStatus=401`, `path=providers.liveValidate` |
| `EV-P15-A-KEYS-001` | item A keys gate | `providers.status` | `validated=0`, `configuredUnprobed=1`, `missingKey=7`, ids=`anthropic,google,groq,deepseek,qwen,llama,kimi` |
| `EV-P15-B-ARCHIVE-001` | item B archive gate | local presence probe | `{ dbPresent:false, seedPresent:false }` |
| `EV-P15-B-ARCHIVE-002` | item B context | `onx.selfVerify` corpus block | `22500/22500`, `POSTGRES`, `summaryCount=88` |

Source-state head/run for attempts: `72efda7` / `29391052442` (head-matched success).

---

## 2) Gate verdicts (PROVEN/UNPROVEN only)

| Gate | Verdict | Decision basis | Atomic blocker (if UNPROVEN) | Probe/output shape anchor | Retry UTC |
|---|---|---|---|---|---|
| item A secret gate | `UNPROVEN` | Authorized success path did not execute; only unauthorized outcome observed | valid `x-onx-bridge-key` unavailable in current envelope | `EV-P15-A-SECRET-001` error shape (`-32001/401/path`) | `2026-07-15T14:05:00Z` |
| item A keys gate | `UNPROVEN` | Full key readiness not met (`missingKey=7`, `validated=0`) | provider secrets missing for 7 providers | `EV-P15-A-KEYS-001` aggregate shape (counts + ids) | `2026-07-16T06:05:00Z` |
| item B archive gate | `UNPROVEN` | Required authentic artifacts not present locally | `onx-database.db` and `knowledge-seed-15k.json` absent in scope | `EV-P15-B-ARCHIVE-001` boolean shape + `scripts/seed-corpus.ts:13` contract | `2026-07-16T06:05:00Z` |

---

## 3) Counts delta (P-14 -> P-15)

| Metric | Before (P-14) | After (P-15) | Delta |
|---|---:|---:|---:|
| Unmet gates (target set) | 3 | 3 | 0 |
| PROVEN gates in target set | 0 | 0 | 0 |
| UNPROVEN gates in target set | 3 | 3 | 0 |

---

## 4) Contract anchors (deterministic)

- `providers.liveValidate` guard requirement: `api/providers-router.ts:5,11,26`
- archive seed filename contract: `scripts/seed-corpus.ts:13`
- no-PROVEN-without-live rule for this wave: only gates with successful live closure evidence are eligible (none met).

---

## 5) Post-commit tuple (P-15)

- **Commit SHA:** `TBD`
- **Truth Gates run:** `TBD`
- **headSha matched:** `TBD`

