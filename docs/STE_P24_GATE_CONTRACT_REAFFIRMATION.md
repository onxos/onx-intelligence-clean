# STE-P-24 Gate Contract Reaffirmation

**IU:** STE-P-24  
**Tier:** 2  
**Branch:** `onxos-ste01-deploy-readiness`  
**Artifact:** `onx-intelligence-clean/docs/STE_P24_GATE_CONTRACT_REAFFIRMATION.md`

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

## 1) Live reaffirmation baseline (current head)

Execution UTC: `2026-07-15T06:38:26Z`  
Execution head: `db7ade2cfed5b2d914b9cba627cc7f7bf7589d9b`

| Evidence ID | Gate | Probe executed | Output (live) | Verdict |
|---|---|---|---|---|
| `EV-P24-HEAD-001` | run-backed context | direct+gateway `/health` | direct/gateway `status="ALIVE"` with commit parity=`db7ade2cfed5b2d914b9cba627cc7f7bf7589d9b` | `PROVEN` |
| `EV-P24-A-SECRET-001` | item A secret gate | `POST /api/trpc/providers.liveValidate` with current envelope | `HAS_SECRET=false`; error `code=-32001`, `httpStatus=401`, `path="providers.liveValidate"` | `UNPROVEN` |
| `EV-P24-A-KEYS-001` | item A keys gate | `GET /api/trpc/providers.status` | `validated=0`, `configuredUnprobed=1`, `missingKey=7`, ids=`anthropic,google,groq,deepseek,qwen,llama,kimi` | `UNPROVEN` |
| `EV-P24-B-ARCHIVE-001` | item B archive gate | local presence/hash probe (`onx-database.db`,`knowledge-seed-15k.json`) | `{"dbPresent":false,"seedPresent":false,"dbSha":null,"seedSha":null}` | `UNPROVEN` |
| `EV-P24-B-ARCHIVE-002` | item B archive context | `GET /api/trpc/onx.selfVerify` corpus block | `rawTotal=22500`, `uniqueByTitleBody=22500`, `persistence="POSTGRES"`, `truthLedger.count=97` | `PROVEN` |

---

## 2) Contract validity + atomic blocker reaffirmation

| Gate | Contract executable now | Atomic blocker | Output shape reference | Verdict |
|---|---|---|---|---|
| item A secret gate | yes (`providers.liveValidate` reachable; guard envelope measurable) | missing caller `x-onx-bridge-key` only | `EV-P24-A-SECRET-001` (`-32001/401/path`) | `UNPROVEN` |
| item A keys gate | yes (`providers.status` reachable and deterministic) | missing provider secrets only (7 ids) | `EV-P24-A-KEYS-001` (aggregate + ids) | `UNPROVEN` |
| item B archive gate | yes (presence/hash probe + `onx.selfVerify` post-check reachable) | missing external REC-06 artifacts only | `EV-P24-B-ARCHIVE-001` (presence/hash JSON) | `UNPROVEN` |

No residual gate has new closure evidence; all remain `UNPROVEN`.

---

## 3) Retry windows with explicit time measurements

Reference point: `2026-07-15T06:38:26Z`.

| Gate | Retry UTC (updated) | Time-to-retry from reference | Probe contract at retry |
|---|---|---|---|
| item A secret gate | `2026-07-15T18:55:00Z` | `T+12h16m34s` | one authorized `providers.liveValidate` call, capture full JSON envelope |
| item A keys gate | `2026-07-16T10:55:00Z` | `T+28h16m34s` | `providers.status` then authorized `providers.liveValidate`, capture both outputs |
| item B archive gate | `2026-07-16T10:55:00Z` | `T+28h16m34s` | artifact presence/hash, then ingest + `onx.selfVerify` post-check |

---

## 4) Internal-prerequisite discovery check (new vs existing)

| Check | Evidence | Result |
|---|---|---|
| Bridge guard contract unchanged | `api/providers-router.ts:25-33` (`assertBridgeAccess`, `liveValidateProviders`) | no new internal prerequisite detected |
| Archive seed contract unchanged | `scripts/seed-corpus.ts:13,20-35,179-193` (`knowledge-seed-15k.json` lookup + fallback logic) | no new internal prerequisite detected |
| Code delta since accepted P-23 head | `git diff --name-only db7ade2cfed5b2d914b9cba627cc7f7bf7589d9b HEAD` => empty | no new internal prerequisite introduced |

---

## 5) Delta counts (P-23 -> P-24)

| Metric | Before (P-23) | After (P-24) | Delta |
|---|---:|---:|---:|
| Residual gates | 3 | 3 | 0 |
| PROVEN (target set) | 0 | 0 | 0 |
| UNPROVEN (target set) | 3 | 3 | 0 |

---

## 6) Post-commit tuple (P-24)

- **Commit SHA:** `TBD`
- **Truth Gates run:** `TBD`
- **headSha matched:** `TBD`

