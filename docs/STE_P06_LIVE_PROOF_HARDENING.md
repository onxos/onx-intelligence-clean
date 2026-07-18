# STE-P-06 Live-Proof Hardening

**IU:** STE-P-06  
**Tier:** 2  
**Branch:** `onxos-ste01-deploy-readiness`  
**Artifact:** `docs/STE_P06_LIVE_PROOF_HARDENING.md`

---

## 0) Envelope + Caps

| Cap | Value |
|---|---|
| MAX_AI_CREDITS | `6` |
| MAX_INPUT_TOKENS | `120000` |
| MAX_OUTPUT_TOKENS | `24000` |
| MAX_CONTEXT_TOKENS | `160000` |
| MAX_RUNTIME_MINUTES | `60` |
| MAX_RETRIES | `2` |
| ESCALATION_TIER | `3 only on proven blocker` |

---

## 1) Live probes executed (authorized scope)

| Evidence ID | Probe | Measured result |
|---|---|---|
| EV-P06-HEALTH-PARITY-001 | direct `/health` vs gateway `/intelligence/health` | `ALIVE/ALIVE`, commit parity = `efd269f8b29261b55902076492466c1e9bd3c87e` |
| EV-P06-SELFVERIFY-001 | `onx.selfVerify` via gateway | `claimsMeasured=19`, `claimsAsserted=0`, `corpus=22500/22500`, `summaryCount=79`, `POSTGRES` |
| EV-P06-TRUTHHISTORY-001 | `onx.truthHistory` via gateway | `count=20`, `retention.keep=168`, `genesis=true`, `POSTGRES` |
| EV-P06-PROVIDERS-STATUS-001 | `providers.status` via gateway | `total=8`, `configuredUnprobed=1`, `missingKey=7`, `validated=0` |
| EV-P06-PROVIDERS-LIVEVALIDATE-001 | keyless `providers.liveValidate` | `401 BRIDGE_UNAUTHORIZED` (fail-closed preserved) |

**Source-state SHA/run for live probes:** `efd269f` / `29388575739` (Truth Gates success on matching head).

---

## 2) Axis hardening matrix (maximize LIVE_PROVEN honestly)

| Axis | Prior (P-05) | Hardened status (P-06) | Evidence IDs | file:line anchors | SHA / run |
|---|---|---|---|---|---|
| `MO_038` | `RESTATED` | `RESTATED` | `EV-P04-MO038-SEARCH-001`, `EV-P04-MO038-RESTATED-001` | `docs/STE_P04_RECOVERY_TRACK.md:57-63,67-76` | `3ac4d8b` / `29387959068` |
| `PROVIDER_KEYS` | `IMPLEMENTED` | `IMPLEMENTED` | `EV-P06-PROVIDERS-STATUS-001`, `EV-P06-PROVIDERS-LIVEVALIDATE-001`, `EV-P04-PROVIDERS-CONTRACT-001` | `api/lib/provider-registry.ts:5-12,68-90,142-161`; `api/providers-router.ts:25-33`; this file `:31-35` | `efd269f` / `29388575739` |
| `CORPUS_ARCHIVE_19012` | `UNPROVEN` | `UNPROVEN` | `EV-P04-CORPUS-GAP-001`, `EV-P06-SELFVERIFY-001` | `docs/CORPUS_GAP_REPORT.md:11-15,49-51`; `docs/STE_P04_RECOVERY_TRACK.md:98-101`; this file `:29-31` | `3ac4d8b` / `29387959068` |
| `INTELLIGENCE_DEPLOYMENT` | `LIVE_PROVEN` | `LIVE_PROVEN` | `EV-P06-HEALTH-PARITY-001`, `EV-P06-SELFVERIFY-001`, `EV-P06-TRUTHHISTORY-001` | this file `:27-33`; `docs/STE_P05_LIVE_PROOF_MATRIX.md:31,44` | `efd269f` / `29388575739` |

---

## 3) IMPLEMENTED → LIVE_PROVEN conversion ledger (claim-level)

| Claim | Prior | P-06 | Evidence ID | file:line | SHA / run |
|---|---|---|---|---|---|
| Provider fail-closed bridge guard exists and blocks unauthorized mutation | `IMPLEMENTED` | `LIVE_PROVEN` | `EV-P06-PROVIDERS-LIVEVALIDATE-001` | `api/providers-router.ts:25-33`; this file `:34-35` | `efd269f` / `29388575739` |
| Provider registry is exposed with measured statuses at runtime | `IMPLEMENTED` | `LIVE_PROVEN` | `EV-P06-PROVIDERS-STATUS-001` | `api/lib/provider-registry.ts:68-90`; this file `:33-34` | `efd269f` / `29388575739` |
| Provider keys validated live for all providers | `IMPLEMENTED` | `UNPROVEN` | `EV-P06-PROVIDERS-STATUS-001` | this file `:33-35`; `docs/STE_P04_RECOVERY_TRACK.md:140-144` | `efd269f` / `29388575739` |

---

## 4) Blocked/UNPROVEN items with retry timestamps (no stop)

| Blocked item | Axis | Status | Active retry action | Owner | Retry cadence | Next retry (UTC) |
|---|---|---|---|---|---|---|
| Bridge-authorized `providers.liveValidate` not executed in this wave | `PROVIDER_KEYS` | `UNPROVEN` | Execute controlled liveValidate with valid `x-onx-bridge-key` and archive validation payload | Secrets owner + bridge owner | Every 8h | 2026-07-15T12:40:00Z |
| Missing keys for 7 providers (anthropic/google/groq/deepseek/qwen/llama/kimi) | `PROVIDER_KEYS` | `UNPROVEN` | Provision keys by priority, then re-run liveValidate | Secrets owner | Every 24h | 2026-07-16T04:40:00Z |
| REC-06 authentic archive `19,012` unavailable in-repo | `CORPUS_ARCHIVE_19012` | `UNPROVEN` | Re-open acquisition with checksum + source URI and perform ingest on delivery | Coordinator / Founder intake | Every 24h | 2026-07-16T04:40:00Z |
| Cross-repo seed artifacts (`onx-database.db`, `knowledge-seed-15k.json`) unavailable locally | `CORPUS_ARCHIVE_19012` | `UNPROVEN` | Cross-repo export/import request with immutable SHA proof + dry-ingest | Repo recovery owner (cross-repo) | Every 12h | 2026-07-15T16:40:00Z |

---

## 5) P06 post-commit gate binding

- **Commit SHA:** `TBD`
- **Truth Gates run:** `TBD`
- **Rule:** acceptance requires run success on the exact same head SHA.

