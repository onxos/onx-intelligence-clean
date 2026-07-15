# STE-P-08 UNPROVEN Reduction

**IU:** STE-P-08  
**Tier:** 2  
**Branch:** `onxos-ste01-deploy-readiness`  
**Artifact:** `docs/STE_P08_UNPROVEN_REDUCTION.md`

---

## 0) Caps

| Cap | Value |
|---|---|
| MAX_AI_CREDITS | `6` |
| MAX_INPUT_TOKENS | `120000` |
| MAX_OUTPUT_TOKENS | `24000` |
| MAX_CONTEXT_TOKENS | `160000` |
| MAX_RUNTIME_MINUTES | `60` |
| MAX_RETRIES | `2` |

---

## 1) Run-backed probes on current HEAD

| Evidence ID | Probe | Result (measured now) | file:line |
|---|---|---|---|
| EV-P08-HEAD-PARITY-001 | direct `/health` + gateway `/intelligence/health` | `ALIVE/ALIVE`, commit parity = `5c3ea61c582f0b4c46b62da4fdf2a2f654d22e6d` | this file `:27-32` |
| EV-P08-PROVIDERS-STATUS-001 | `providers.status` via gateway | `total=8`, `configuredUnprobed=1`, `missingKey=7`, `validated=0` | this file `:27-32` |
| EV-P08-PROVIDERS-LIVEVALIDATE-001 | keyless `providers.liveValidate` | `401 BRIDGE_UNAUTHORIZED` (fail-closed live behavior proven) | `api/providers-router.ts:25-33`; this file `:27-32` |
| EV-P08-CORPUS-LIVE-001 | `onx.selfVerify` via gateway | `corpus=22500/22500`, `persistence=POSTGRES`, `summaryCount=81` | this file `:27-32` |
| EV-P08-CORPUS-ARCHIVE-GAP-001 | local corpus archive presence scan | `onx-database.db` / `knowledge-seed-15k.json` still absent locally (references only) | `docs/CORPUS_GAP_REPORT.md:11-12,49`; `scripts/seed-corpus.ts:13` |

**Head/Run binding:** HEAD `5c3ea61c582f0b4c46b62da4fdf2a2f654d22e6d` with latest proven run `29389099170` (head-matched success).

---

## 2) UNPROVEN reduction attempt (P-07 ➜ P-08)

| Target item from P-07 residual | P-07 status | P-08 status | Reduction result | Evidence IDs | SHA / run |
|---|---|---|---|---|---|
| Provider live validation endpoint behavior | `UNPROVEN` (broadly phrased) | `PROVEN` (fail-closed runtime path) | **Reduced** by proving live keyless guard behavior on current head | `EV-P08-PROVIDERS-LIVEVALIDATE-001`, `EV-P08-HEAD-PARITY-001` | `5c3ea61` / `29389099170` |
| Authorized provider model validation (requires bridge key + provider keys) | `UNPROVEN` | `UNPROVEN` | No reduction (secret-gated blocker remains) | `EV-P08-PROVIDERS-STATUS-001` | `5c3ea61` / `29389099170` |
| Corpus archive evidence for authentic `19,012` | `UNPROVEN` | `UNPROVEN` | No reduction (external artifact still unavailable) | `EV-P08-CORPUS-ARCHIVE-GAP-001`, `EV-P08-CORPUS-LIVE-001` | `5c3ea61` / `29389099170` |

---

## 3) Residual UNPROVEN set (atomic reasons + retry)

| Residual item | Status | Atomic blocker reason | Next retry (UTC) | Owner | Source |
|---|---|---|---|---|---|
| Authorized `providers.liveValidate` success path | `UNPROVEN` | Missing valid bridge secret for authorized probe | 2026-07-15T12:55:00Z | Secrets owner + bridge owner | `docs/STE_P07_RUNTIME_PROOF_INDEX.md:38`; `docs/STE_P06_LIVE_PROOF_HARDENING.md:63` |
| 7 providers still missing keys | `UNPROVEN` | Provider API secrets not provisioned (anthropic/google/groq/deepseek/qwen/llama/kimi) | 2026-07-16T04:55:00Z | Secrets owner | `docs/STE_P07_RUNTIME_PROOF_INDEX.md:39`; `docs/STE_P06_LIVE_PROOF_HARDENING.md:64` |
| Authentic REC-06 corpus archive (`19,012`) evidence | `UNPROVEN` | External archive package not present in this repository scope | 2026-07-16T04:55:00Z | Coordinator / Founder intake | `docs/STE_P07_RUNTIME_PROOF_INDEX.md:40-41`; `docs/CORPUS_GAP_REPORT.md:11-12,49` |

---

## 4) Counts (P-07 baseline vs P-08)

| Metric | P-07 | P-08 |
|---|---:|---:|
| UNPROVEN residual items | 4 | 3 |
| Newly PROVEN in this wave (run-backed) | 0 | 1 |
| Still UNPROVEN (external/secret-gated) | 4 | 3 |

---

## 5) Post-commit tuple (P-08)

- **Commit SHA:** `TBD`
- **Truth Gates run:** `TBD`
- **Head-matched required:** yes

