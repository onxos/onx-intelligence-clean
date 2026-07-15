# STE-P-13 Prereq Hardening Pack

**IU:** STE-P-13  
**Tier:** 2  
**Branch:** `onxos-ste01-deploy-readiness`  
**Artifact:** `onx-intelligence-clean/docs/STE_P13_PREREQ_HARDENING_PACK.md`

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

## 1) Item A prerequisite hardening — providers authorized path

### 1.1 Secret readiness checklist (verdict per prerequisite)

| Prerequisite | Evidence ID | Probe / source | Verdict |
|---|---|---|---|
| Deployed head parity (direct/gateway same commit) | `EV-P13-A-HEAD-001` | live `/health` parity commit=`2a19e9851912860e913ae0be2688595d7011819d` | `PROVEN` |
| Route is bridge-guarded (authorized secret required) | `EV-P13-A-CONTRACT-001` | `api/providers-router.ts:5,11,26` (`assertBridgeAccess`) | `PROVEN` |
| Authorized success path executable from current envelope | `EV-P13-A-PROBE-001` | keyless retry to `providers.liveValidate` returned `401 BRIDGE_UNAUTHORIZED` | `UNPROVEN` |
| Provider keys are fully ready for validation | `EV-P13-A-PROBE-002` | `providers.status`: `validated=0`, `configuredUnprobed=1`, `missingKey=7` | `UNPROVEN` |

### 1.2 Executable probes + expected outputs

1. Probe authorized path (requires secret):
   - `curl -s -X POST "https://onx-gateway.onrender.com/intelligence/api/trpc/providers.liveValidate" -H "content-type: application/json" -H "x-onx-bridge-key: <BRIDGE_SHARED_SECRET>" -d "{\"json\":{}}"`
   - Expected success output: JSON envelope with `result.data.json[]`, at least one entry `status="VALIDATED"` and fields `latencyMs`, `modelCount`, `error`.
2. Post-check providers state:
   - `curl -s "https://onx-gateway.onrender.com/intelligence/api/trpc/providers.status?input=%7B%22json%22%3A%7B%7D%7D"`
   - Expected success output: provider rows with `status` showing `VALIDATED` where live probe succeeded.

### 1.3 Evidence IDs + output shape

| Evidence ID | Output shape |
|---|---|
| `EV-P13-A-PROBE-001` | Error shape (current) `{ error.json.code=-32001, data.httpStatus=401, data.path="providers.liveValidate" }` or success shape with validated entries when secret exists |
| `EV-P13-A-PROBE-002` | Aggregate status shape with counts (`validated/configuredUnprobed/missingKey`) and missing provider IDs |

### 1.4 Blocker and retry

- **Atomic blocker:** no valid `x-onx-bridge-key` available in this execution envelope; plus missing provider keys keep full authorized validation unresolved.
- **Retry UTC:** `2026-07-15T13:45:00Z`

---

## 2) Item B prerequisite hardening — authentic REC-06 archive proof

### 2.1 Archive readiness checklist (verdict per prerequisite)

| Prerequisite | Evidence ID | Probe / source | Verdict |
|---|---|---|---|
| Ingestion path exists and is defined | `EV-P13-B-CONTRACT-001` | `api/corpus-query-router.ts:109-112` (`ingest`) | `PROVEN` |
| Required seed filename contract exists | `EV-P13-B-CONTRACT-002` | `scripts/seed-corpus.ts:13` (`knowledge-seed-15k.json`) | `PROVEN` |
| Authentic archive artifacts are locally present (`onx-database.db`, `knowledge-seed-15k.json`) | `EV-P13-B-PROBE-001` | filesystem probe => both `false` | `UNPROVEN` |
| Live corpus context measurable post-deploy | `EV-P13-B-PROBE-002` | `onx.selfVerify` => `22500/22500`, `POSTGRES`, `summaryCount=86` | `PROVEN` |

### 2.2 Executable probes + expected outputs

1. Artifact presence + checksum step:
   - Check file presence for both required artifacts.
   - Compute SHA-256 and compare against source checksums.
   - Expected success output: both files present + exact hash strings.
2. Ingest execution step (after artifacts are present):
   - Call `corpusQuery.ingest` in bounded batches.
   - Expected success output: envelope with `accepted`, `duplicates`, `total`, `persistence`.
3. Post-check step:
   - Read `onx.selfVerify` corpus block + manifest counters.
   - Expected success output: deterministic counters with provenance-consistent disclosure.

### 2.3 Evidence IDs + output shape

| Evidence ID | Output shape |
|---|---|
| `EV-P13-B-PROBE-001` | `{ dbPresent: boolean, seedPresent: boolean }` |
| `EV-P13-B-PROBE-002` | `{ corpusRaw:number, corpusUnique:number, corpusPersistence:string, summaryCount:number, summaryCapturedAt:string }` |
| `EV-P13-B-INGEST-001` | Ingest response `{ accepted:number, duplicates:number, total:number, persistence:string }` |

### 2.4 Blocker and retry

- **Atomic blocker:** authentic REC-06 archive artifacts are not present in repository scope, so ingestion proof cannot start.
- **Retry UTC:** `2026-07-16T05:45:00Z`

---

## 3) Deterministic no-inference rule

Any prerequisite marked `PROVEN` above is directly backed by a live probe or code contract anchor. Any unmet prerequisite remains `UNPROVEN`.

---

## 4) Counts (prerequisite verdicts)

| Scope | Total prereqs | PROVEN | UNPROVEN |
|---|---:|---:|---:|
| Item A (providers authorized path) | 4 | 2 | 2 |
| Item B (REC-06 archive proof) | 4 | 3 | 1 |
| Combined | 8 | 5 | 3 |

---

## 5) Post-commit tuple (P-13)

- **Commit SHA:** `TBD`
- **Truth Gates run:** `TBD`
- **headSha matched:** `TBD`
- **Reference head for live probes:** `2a19e9851912860e913ae0be2688595d7011819d` (`UTC=2026-07-15T05:09:15Z`)

