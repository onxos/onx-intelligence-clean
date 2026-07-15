# STE-P-18 Residual Gate Final Contract

**IU:** STE-P-18  
**Tier:** 2  
**Branch:** `onxos-ste01-deploy-readiness`  
**Artifact:** `onx-intelligence-clean/docs/STE_P18_RESIDUAL_GATE_FINAL_CONTRACT.md`

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

## 1) Final external prerequisites inventory (remaining 3 gates)

| Gate | Required external prerequisite(s) | Internal prerequisites satisfied? | Current verdict |
|---|---|---|---|
| item A secret gate (`providers.liveValidate` authorized success path) | Valid `x-onx-bridge-key` (`BRIDGE_SHARED_SECRET`) available to caller | Yes (route exists + guard contract + endpoint reachable) | `UNPROVEN` |
| item A keys gate (provider readiness) | Provider API keys provisioned for all missing providers (anthropic/google/groq/deepseek/qwen/llama/kimi) | Yes (status endpoint reachable and measurable) | `UNPROVEN` |
| item B archive gate (authentic REC-06 proof) | Delivery of authentic `onx-database.db` + `knowledge-seed-15k.json` with checksums/provenance | Yes (ingest path and post-check path exist) | `UNPROVEN` |

Contract anchors:
- providers guard/route contract: `api/providers-router.ts:5,11,26`
- archive seed contract: `scripts/seed-corpus.ts:13`

---

## 2) Exhausted attempts ledger (per gate)

| Gate | Attempt evidence set (chronological) | Last observed output shape | Verdict |
|---|---|---|---|
| item A secret gate | `EV-P14-AUTH-TRY-001` -> `EV-P15-A-SECRET-001` -> `EV-P17-A-SECRET-001` | error envelope `code=-32001`, `httpStatus=401`, `path=providers.liveValidate` | `UNPROVEN` |
| item A keys gate | `EV-P14-AUTH-TRY-002` -> `EV-P15-A-KEYS-001` -> `EV-P17-A-KEYS-001` | aggregate status `{validated:0, configuredUnprobed:1, missingKey:7, missingIds:...}` | `UNPROVEN` |
| item B archive gate | `EV-P14-REC06-TRY-001` -> `EV-P15-B-ARCHIVE-001` -> `EV-P17-B-ARCHIVE-001` | presence shape `{dbPresent:false, seedPresent:false}` | `UNPROVEN` |

Latest run-backed baseline used for this closure contract: head `8641df45fe71c60fb56ee12141f7d126d6aeae04` with run `29391918321` (head-matched success).

---

## 3) Single next executable path per gate (next retry window)

| Gate | Single next executable path | Expected success output shape | Next retry UTC |
|---|---|---|---|
| item A secret gate | Execute one authorized call with `x-onx-bridge-key` then capture response | `providers.liveValidate` returns `result.data.json[]` with at least one `status=\"VALIDATED\"` | `2026-07-15T14:35:00Z` |
| item A keys gate | Provision missing provider keys, then call `providers.status` and authorized `liveValidate` once | `missingKey=0` and/or `validated>0`; provider rows show `VALIDATED` where probe succeeds | `2026-07-16T06:35:00Z` |
| item B archive gate | Deliver REC-06 artifacts with checksums, verify presence/hashes, run ingest, then post-check | presence `{dbPresent:true, seedPresent:true}` + ingest `{accepted,duplicates,total,persistence}` + post-check corpus/provenance update | `2026-07-16T06:35:00Z` |

---

## 4) Promotion rule (UNPROVEN -> PROVEN)

A gate is promoted from `UNPROVEN` to `PROVEN` **only if all conditions hold**:
1. A live probe for that gate succeeds and returns the expected success output shape.
2. The evidence is captured on the current branch head.
3. That head has a successful Truth Gates run with matching `headSha`.
4. Evidence IDs and file:line anchors are recorded in the gate artifact.

If any condition is not satisfied, the gate remains `UNPROVEN`.

---

## 5) State lock (current wave)

- All three residual gates remain `UNPROVEN`.
- No new run-backed success evidence appeared in this wave.
- Therefore no promotion occurred.

---

## 6) Delta counts (P-17 -> P-18)

| Metric | Before (P-17) | After (P-18) | Delta |
|---|---:|---:|---:|
| Residual gates | 3 | 3 | 0 |
| PROVEN | 0 | 0 | 0 |
| UNPROVEN | 3 | 3 | 0 |

---

## 7) Post-commit tuple (P-18)

- **Commit SHA:** `TBD`
- **Truth Gates run:** `TBD`
- **headSha matched:** `TBD`

