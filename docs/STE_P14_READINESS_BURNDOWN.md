# STE-P-14 Readiness Burndown (Delta-Ready View)

**IU:** STE-P-14  
**Tier:** 2  
**Branch:** `onxos-ste01-deploy-readiness`  
**Artifact:** `onx-intelligence-clean/docs/STE_P14_READINESS_BURNDOWN.md`

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

## 1) Re-executed prerequisite probes (run-backed)

| Evidence ID | Probe | Measured output |
|---|---|---|
| `EV-P14-HEAD-001` | direct/gateway `/health` parity | `ALIVE/ALIVE`, commit=`f16be33fb10013e486b16229a541cde3989828a8` |
| `EV-P14-AUTH-TRY-001` | keyless `providers.liveValidate` retry | `401 BRIDGE_UNAUTHORIZED`, `path=providers.liveValidate` |
| `EV-P14-AUTH-TRY-002` | `providers.status` post-check | `validated=0`, `configuredUnprobed=1`, `missingKey=7`, ids=`anthropic,google,groq,deepseek,qwen,llama,kimi` |
| `EV-P14-REC06-TRY-001` | local archive artifact probe | `dbPresent=false`, `seedPresent=false` |
| `EV-P14-REC06-TRY-002` | `onx.selfVerify` corpus context | `22500/22500`, `POSTGRES`, `summaryCount=87` |

**Source-state head/run for probes:** `f16be33` / `29390753065` (head-matched success).

---

## 2) Unmet checks only (delta-ready)

| Unmet check | Item | Status | Atomic blocker | Probe/evidence shape | Retry UTC |
|---|---|---|---|---|---|
| Authorized success execution for `providers.liveValidate` | A | `UNPROVEN` | Missing valid `x-onx-bridge-key` in current envelope | `EV-P14-AUTH-TRY-001` error shape: `code=-32001`, `httpStatus=401`, `path=providers.liveValidate` | `2026-07-15T13:55:00Z` |
| Provider-key readiness for full live validation | A | `UNPROVEN` | 7 provider keys still missing (`validated=0`) | `EV-P14-AUTH-TRY-002` output shape: aggregate counts + missing provider ids | `2026-07-16T05:55:00Z` |
| Authentic REC-06 archive artifacts present for proof path | B | `UNPROVEN` | Required artifacts absent from repo scope (`onx-database.db`, `knowledge-seed-15k.json`) | `EV-P14-REC06-TRY-001` output shape: `{dbPresent:boolean, seedPresent:boolean}` | `2026-07-16T05:55:00Z` |

---

## 3) Minimal executable delta plan (before next retry windows)

1. **Before 2026-07-15T13:55:00Z (Item A / secret gate):** inject valid `x-onx-bridge-key` in controlled run and execute one authorized `providers.liveValidate` call, then capture `providers.status`.
2. **Before 2026-07-16T05:55:00Z (Item A / keys gate):** provision keys for missing providers (priority: anthropic, google), then re-run authorized probe and record any `VALIDATED` transitions.
3. **Before 2026-07-16T05:55:00Z (Item B / archive gate):** deliver `onx-database.db` + `knowledge-seed-15k.json` with checksums, verify presence/hashes, then execute ingest + post-check and capture deterministic evidence.

---

## 4) Delta counts

| Metric | P-13 (baseline) | P-14 (current) | Delta |
|---|---:|---:|---:|
| Total unmet checks | 3 | 3 | 0 |
| Item A unmet | 2 | 2 | 0 |
| Item B unmet | 1 | 1 | 0 |
| Newly PROVEN in this wave | 0 | 0 | 0 |

---

## 5) Deterministic rule

No check is marked `PROVEN` unless supported by live run-backed evidence.

---

## 6) Post-commit tuple (P-14)

- **Commit SHA:** `TBD`
- **Truth Gates run:** `TBD`
- **headSha matched:** `TBD`

