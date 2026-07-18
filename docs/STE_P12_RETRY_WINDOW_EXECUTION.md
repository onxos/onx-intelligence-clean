# STE-P-12 Retry Window Execution

**IU:** STE-P-12  
**Tier:** 2  
**Branch:** `onxos-ste01-deploy-readiness`  
**Artifact:** `onx-intelligence-clean/docs/STE_P12_RETRY_WINDOW_EXECUTION.md`

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

## 1) Retry execution attempts (live)

### 1.1 Item A — providers.liveValidate authorized success path

| Evidence ID | Probe | Live result |
|---|---|---|
| `EV-P12-HEAD-BIND-001` | `/health` direct+gateway parity | `ALIVE/ALIVE`, commit=`de422932167b4980e72459fff7d0c9b35f135cf4` |
| `EV-P12-PROVIDERS-TRY-001` | keyless `providers.liveValidate` retry | `401 BRIDGE_UNAUTHORIZED` with path `providers.liveValidate` |
| `EV-P12-PROVIDERS-TRY-002` | post-retry `providers.status` | `validated=0`, `configuredUnprobed=1`, `missingKey=7` |

- **Status:** `UNPROVEN`
- **Decision anchor:** this file `:27-35`
- **Atomic blocker:** missing valid `x-onx-bridge-key` in current execution envelope, so authorized success path cannot run.
- **Retry (UTC):** `2026-07-15T13:35:00Z`

### 1.2 Item B — authentic REC-06 corpus archive proof

| Evidence ID | Probe | Live result |
|---|---|---|
| `EV-P12-REC06-TRY-001` | local artifact presence check | `onx-database.db=false`, `knowledge-seed-15k.json=false` |
| `EV-P12-REC06-TRY-002` | live corpus context (`onx.selfVerify`) | `22500/22500`, `POSTGRES`, `summaryCount=84` |

- **Status:** `UNPROVEN`
- **Decision anchor:** this file `:45-52`
- **Atomic blocker:** authentic REC-06 archive artifacts are absent from repository scope.
- **Retry (UTC):** `2026-07-16T05:35:00Z`

---

## 2) Deterministic rule enforcement

No item is marked `PROVEN` without live run-backed evidence generated on a head with successful Truth Gates and headSha match.

---

## 3) Counts before/after

| Metric | Before (P-11) | After (P-12) |
|---|---:|---:|
| Residual target items | 2 | 2 |
| UNPROVEN | 2 | 2 |
| PROVEN | 0 | 0 |
| REDUCED | — | 0 |

---

## 4) Post-commit tuple (P-12)

- **Commit SHA:** `TBD`
- **Truth Gates run:** `TBD`
- **headSha matched:** `TBD`
- **Reference head for live attempts:** `de422932167b4980e72459fff7d0c9b35f135cf4` (`UTC=2026-07-15T05:02:46Z`)

