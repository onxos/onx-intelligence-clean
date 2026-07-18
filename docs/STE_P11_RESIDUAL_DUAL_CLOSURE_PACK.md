# STE-P-11 Residual Dual Closure Pack

**IU:** STE-P-11  
**Tier:** 2  
**Branch:** `onxos-ste01-deploy-readiness`  
**Artifact:** `onx-intelligence-clean/docs/STE_P11_RESIDUAL_DUAL_CLOSURE_PACK.md`

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

## 1) Residual item A — `providers.liveValidate` authorized success path

### 1.1 Status

- **Status:** `UNPROVEN`
- **Atomic blocker:** valid `x-onx-bridge-key` secret is unavailable in this execution envelope; authorized path cannot be executed.
- **Retry (UTC):** `2026-07-15T13:25:00Z`

### 1.2 Secret contract (exact requirements)

1. Request target: `POST /api/trpc/providers.liveValidate`
2. Required header: `x-onx-bridge-key: <BRIDGE_SHARED_SECRET>`
3. Required body: `{"json":{}}` with `content-type: application/json`
4. Success preconditions:
   - Bridge secret valid.
   - Provider key(s) provisioned for provider(s) under probe.
5. Success semantics:
   - At least one provider returns `status=VALIDATED` with measurable fields (`latencyMs`, `modelCount`, `validatedAt`).

### 1.3 Executable verification steps

1. Run authorized mutation:
   - `curl -s -X POST "https://onx-gateway.onrender.com/intelligence/api/trpc/providers.liveValidate" -H "content-type: application/json" -H "x-onx-bridge-key: <BRIDGE_SHARED_SECRET>" -d "{\"json\":{}}"`
2. Re-read provider status:
   - `curl -s "https://onx-gateway.onrender.com/intelligence/api/trpc/providers.status?input=%7B%22json%22%3A%7B%7D%7D"`
3. Validate output shape:
   - `liveValidate` JSON includes entries with `id,status,latencyMs,modelCount,error`.
   - `providers.status` JSON includes provider entries with `status` and optional validation payload.

### 1.4 Expected evidence IDs and output shape

| Evidence ID | Expected output shape |
|---|---|
| `EV-P11-PROVIDERS-AUTH-001` | `providers.liveValidate` returns JSON envelope with `result.data.json[]` entries; at least one `status="VALIDATED"` for proven conversion |
| `EV-P11-PROVIDERS-AUTH-002` | `providers.status` post-check reflects runtime status update (`VALIDATED` where probe succeeded) |
| `EV-P11-PROVIDERS-BLOCKER-001` | If unauthorized/missing secret, error shape contains `code=-32001`, `httpStatus=401`, `path="providers.liveValidate"` |

Current blocker evidence anchor: `docs/STE_P10_FINAL_DUAL_PUSH.md:41`; `api/providers-router.ts:25-33`.

---

## 2) Residual item B — authentic REC-06 corpus archive proof

### 2.1 Status

- **Status:** `UNPROVEN`
- **Atomic blocker:** authentic REC-06 external archive artifacts are absent from current repository scope.
- **Retry (UTC):** `2026-07-16T05:25:00Z`

### 2.2 External archive ingestion contract

1. Required artifacts:
   - `onx-database.db` (authentic REC-06 backing dataset).
   - `knowledge-seed-15k.json` (authentic seed artifact).
2. Provenance requirements:
   - Source URI + immutable SHA-256 for each artifact.
   - Delivery source must match coordinator-approved origin.
3. Ingestion entrypoint:
   - `corpusQuery.ingest` (bridge-guarded) with deterministic dedup and persistence checks.
4. Proof requirements for `PROVEN` conversion:
   - Archive artifacts physically present.
   - Ingestion execution log captured.
   - Post-ingest manifest/selfVerify confirms expected corpus/provenance shift.

### 2.3 Executable verification steps

1. Verify artifacts present locally:
   - Confirm filesystem presence for both files.
   - Compute SHA-256 for both and compare against provided checksums.
2. Run ingestion in bounded batches through bridge-authorized path.
3. Validate post-ingest outputs:
   - `onx.selfVerify` corpus block.
   - corpus manifest/dedup counters.
4. Validate output shape:
   - Ingest response includes accepted/duplicates/total/persistence.
   - Post-check output includes updated corpus totals with explicit provenance disclosure.

### 2.4 Expected evidence IDs and output shape

| Evidence ID | Expected output shape |
|---|---|
| `EV-P11-REC06-ARTIFACTS-001` | Files present + `sha256` hashes for both artifacts (exact strings logged) |
| `EV-P11-REC06-INGEST-001` | Ingest response envelope with `accepted`, `duplicates`, `total`, `persistence` |
| `EV-P11-REC06-POSTCHECK-001` | Post-ingest `selfVerify`/manifest output reflecting deterministic corpus/provenance state |
| `EV-P11-REC06-BLOCKER-001` | Missing-artifact evidence with explicit absent-file result and scope reference |

Current blocker evidence anchor: `docs/CORPUS_GAP_REPORT.md:11-12,49`; `scripts/seed-corpus.ts:13`; `docs/STE_P10_FINAL_DUAL_PUSH.md:42`.

---

## 3) Run-backed rule

No item can be marked `PROVEN` unless evidence is generated on a head with successful Truth Gates run and headSha match.

---

## 4) Post-commit tuple (P-11)

- **Commit SHA:** `TBD`
- **Truth Gates run:** `TBD`
- **headSha matched:** `TBD`

