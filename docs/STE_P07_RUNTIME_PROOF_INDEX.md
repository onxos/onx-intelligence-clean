# STE-P-07 Runtime Proof Index

**IU:** STE-P-07  
**Tier:** 2  
**Branch:** `onxos-ste01-deploy-readiness`  
**Artifact:** `docs/STE_P07_RUNTIME_PROOF_INDEX.md`

---

## 0) Caps (enforced)

| Cap | Value |
|---|---|
| MAX_AI_CREDITS | `6` |
| MAX_INPUT_TOKENS | `120000` |
| MAX_OUTPUT_TOKENS | `24000` |
| MAX_CONTEXT_TOKENS | `160000` |
| MAX_RUNTIME_MINUTES | `60` |
| MAX_RETRIES | `2` |

---

## 1) Unified index across P-04 / P-05 / P-06

| Axis | Current status | Canonical claims | Evidence IDs | Proof anchors (file:line) | SHA / run |
|---|---|---|---|---|---|
| `MO_038` | `RESTATED` | Original MO-038 artifact is absent in current repo scope; deterministic restated edition exists and is tracked | `EV-P04-MO038-SEARCH-001`, `EV-P04-MO038-RESTATED-001` | `docs/STE_P04_RECOVERY_TRACK.md:57-63,67-76`; `docs/STE_P05_LIVE_PROOF_MATRIX.md:28,39-40`; `docs/STE_P06_LIVE_PROOF_HARDENING.md:42` | `3ac4d8b` / `29387959068` |
| `PROVIDER_KEYS` | `IMPLEMENTED` | Provider contract is implemented and fail-closed; runtime status is measured; full live validation for all providers remains blocked by missing secrets/authorized key | `EV-P04-PROVIDERS-CONTRACT-001`, `EV-P06-PROVIDERS-STATUS-001`, `EV-P06-PROVIDERS-LIVEVALIDATE-001` | `api/lib/provider-registry.ts:5-12,68-90,142-161`; `api/providers-router.ts:25-33`; `docs/STE_P04_RECOVERY_TRACK.md:119-121,125-136`; `docs/STE_P05_LIVE_PROOF_MATRIX.md:29,41-42`; `docs/STE_P06_LIVE_PROOF_HARDENING.md:31-35,43,53-55` | `854cd7c` / `29388859468` |
| `CORPUS_ARCHIVE_19012` | `UNPROVEN` | Authentic REC-06 archive (`19,012`) is still unavailable in-repo; live corpus exists but does not prove recovery of external archive | `EV-P04-CORPUS-GAP-001`, `EV-P06-SELFVERIFY-001` | `docs/CORPUS_GAP_REPORT.md:11-15,49-51`; `docs/STE_P04_RECOVERY_TRACK.md:98-101`; `docs/STE_P05_LIVE_PROOF_MATRIX.md:30,43`; `docs/STE_P06_LIVE_PROOF_HARDENING.md:44,65-66` | `3ac4d8b` / `29387959068` |
| `INTELLIGENCE_DEPLOYMENT` | `LIVE_PROVEN` | Deployment and runtime parity are live-proven by health parity, truth surfaces, strict smoke/gates continuity | `EV-P04-SMOKE-STRICT-001`, `EV-P04-GATES-LOCAL-001`, `EV-P06-HEALTH-PARITY-001`, `EV-P06-SELFVERIFY-001`, `EV-P06-TRUTHHISTORY-001` | `docs/STE_P04_RECOVERY_TRACK.md:152-156,162-166,172-174`; `docs/STE_P05_LIVE_PROOF_MATRIX.md:31,44`; `docs/STE_P06_LIVE_PROOF_HARDENING.md:28-30,45` | `854cd7c` / `29388859468` |

---

## 2) UNPROVEN remaining set (reasons + retry time)

| Item | Axis | Status | Reason (truthful) | Active recovery action | Next retry (UTC) | Source |
|---|---|---|---|---|---|---|
| Full provider live validation (`providers.liveValidate` authorized path) | `PROVIDER_KEYS` | `UNPROVEN` | Requires valid `x-onx-bridge-key`; keyless probe is correctly blocked (`401 BRIDGE_UNAUTHORIZED`) | Controlled authorized run and archive response payload | 2026-07-15T12:40:00Z | `docs/STE_P06_LIVE_PROOF_HARDENING.md:32,63` |
| Missing API keys for 7 providers | `PROVIDER_KEYS` | `UNPROVEN` | No secrets provisioned yet for anthropic/google/groq/deepseek/qwen/llama/kimi | Provision keys by priority then re-run authorized validation | 2026-07-16T04:40:00Z | `docs/STE_P06_LIVE_PROOF_HARDENING.md:64` |
| REC-06 authentic archive `19,012` | `CORPUS_ARCHIVE_19012` | `UNPROVEN` | External archive not available in this repo snapshot | Re-open acquisition with checksum + source URI, ingest on delivery | 2026-07-16T04:40:00Z | `docs/STE_P06_LIVE_PROOF_HARDENING.md:65` |
| Cross-repo seed artifacts (`onx-database.db`, `knowledge-seed-15k.json`) | `CORPUS_ARCHIVE_19012` | `UNPROVEN` | Referenced externally but not present locally | Cross-repo export/import with immutable SHA proof + dry-ingest | 2026-07-15T16:40:00Z | `docs/STE_P06_LIVE_PROOF_HARDENING.md:66` |

---

## 3) Latest head binding for this index

- **Current head at index creation:** `854cd7c3b8865ba9d0f49f87e0ea077d8c27183e`
- **Latest proven Truth Gates run on same head:** `29388859468` (success)

---

## 4) Post-commit evidence (P-07)

- **Commit SHA:** `TBD`
- **Truth Gates run:** `TBD`

