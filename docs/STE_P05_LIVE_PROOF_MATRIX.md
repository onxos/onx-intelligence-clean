# STE-P-05 Live-Proof Matrix

**IU:** STE-P-05  
**Tier:** 2  
**Branch:** `onxos-ste01-deploy-readiness`  
**Output:** `docs/STE_P05_LIVE_PROOF_MATRIX.md`

---

## 0) Envelope + Caps (binding)

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

## 1) Axis Live-Proof Matrix (explicit status)

| Axis | Status | Evidence IDs | Proof anchors (file:line) | SHA / run |
|---|---|---|---|---|
| `MO_038` | `RESTATED` | `EV-P04-MO038-SEARCH-001`, `EV-P04-MO038-RESTATED-001` | `docs/STE_P04_RECOVERY_TRACK.md:57-63,67-76`; `docs/STE_P04_RECOVERY_TRACK.md:42-43`; `docs/STE_P04_RECOVERY_TRACK.md:31` | `3ac4d8b` / `29387959068` |
| `PROVIDER_KEYS` | `IMPLEMENTED` | `EV-P04-PROVIDERS-LIVE-001`, `EV-P04-PROVIDERS-CONTRACT-001` | `api/lib/provider-registry.ts:5-12,68-90,142-161`; `api/providers-router.ts:25-33`; `docs/STE_P04_RECOVERY_TRACK.md:119-121,125-136` | `3ac4d8b` / `29387959068` |
| `CORPUS_ARCHIVE_19012` | `UNPROVEN` | `EV-P04-CORPUS-GAP-001` | `docs/CORPUS_GAP_REPORT.md:11-15,49-51`; `docs/OPERATIONS_RUNBOOK.md:194-247`; `docs/STE_P04_RECOVERY_TRACK.md:98-101` | `3ac4d8b` / `29387959068` |
| `INTELLIGENCE_DEPLOYMENT` | `LIVE_PROVEN` | `EV-P04-SMOKE-STRICT-001`, `EV-P04-GATES-LOCAL-001` | `docs/STE_P04_RECOVERY_TRACK.md:152-156,162-166,172-174` | `3ac4d8b` / `29387959068` |

---

## 2) Claim-level evidence table

| Claim | Status class | Evidence ID | file:line | SHA / run |
|---|---|---|---|---|
| MO-038 original artifact is absent in-scope and recovery proceeded without stop | `RESTATED` | `EV-P04-MO038-SEARCH-001` | `docs/STE_P04_RECOVERY_TRACK.md:57-63` | `3ac4d8b` / `29387959068` |
| Restated edition exists as deterministic replacement | `RESTATED` | `EV-P04-MO038-RESTATED-001` | `docs/STE_P04_RECOVERY_TRACK.md:67-76` | `3ac4d8b` / `29387959068` |
| Provider contract is implemented fail-closed with tri-state registry | `IMPLEMENTED` | `EV-P04-PROVIDERS-CONTRACT-001` | `api/lib/provider-registry.ts:5-12,68-90,142-161`; `api/providers-router.ts:25-33` | `3ac4d8b` / `29387959068` |
| Provider keys are not live-proven because authorized probe was not executed in this wave | `IMPLEMENTED` | `EV-P04-PROVIDERS-LIVE-001` | `docs/STE_P04_RECOVERY_TRACK.md:125-136,140-144` | `3ac4d8b` / `29387959068` |
| 19,012 archive recovery remains unavailable in-repo | `UNPROVEN` | `EV-P04-CORPUS-GAP-001` | `docs/CORPUS_GAP_REPORT.md:11-15,49-51`; `docs/STE_P04_RECOVERY_TRACK.md:98-101` | `3ac4d8b` / `29387959068` |
| Intelligence deployment is live-proven by strict smoke and green gates | `LIVE_PROVEN` | `EV-P04-SMOKE-STRICT-001`, `EV-P04-GATES-LOCAL-001` | `docs/STE_P04_RECOVERY_TRACK.md:152-156,162-166,172-174` | `3ac4d8b` / `29387959068` |

---

## 3) Missing-resource to active-recovery actions (no-stop rule)

| Missing resource / gap | Axis | Current status | Active recovery action | Owner | Retry cadence | Next retry (UTC) |
|---|---|---|---|---|---|---|
| REC-06 authentic archive (`19,012`) | `CORPUS_ARCHIVE_19012` | `UNPROVEN` | Re-open acquisition with source URI + checksum requirements; verify delivered artifact hash before ingest | Coordinator / Founder intake | Every 24h | 2026-07-16T04:20:00Z |
| `onx-database.db` and `knowledge-seed-15k.json` from referenced external repo | `CORPUS_ARCHIVE_19012` | `UNPROVEN` | Cross-repo export/import request with immutable SHA proof and dry-ingest check | Repo recovery owner (cross-repo) | Every 12h | 2026-07-15T16:20:00Z |
| Authorized bridge-key live validation not executed for providers in this wave | `PROVIDER_KEYS` | `IMPLEMENTED` | Run controlled `providers.liveValidate` with bridge key and archive validation output | Secrets owner + bridge owner | Every 8h | 2026-07-15T12:20:00Z |
| Missing API keys for 7 providers | `PROVIDER_KEYS` | `IMPLEMENTED` | Provision keys by priority (anthropic/google first), then re-run live validation | Secrets owner | Every 24h | 2026-07-16T04:20:00Z |

---

## 4) P05 post-commit evidence

- **Commit SHA:** `TBD`
- **Truth Gates run:** `TBD`

