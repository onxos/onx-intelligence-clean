# STE-P-04 Recovery Track (MO-038 / Corpus / Providers)

**IU:** STE-P-04  
**Tier:** 2 (cheapest capable)  
**Task Cap:** recovery + docs with deterministic evidence (no Max)  
**Evidence Path:** `onx-intelligence-clean/docs/STE_P04_RECOVERY_TRACK.md`  
**Branch:** `onxos-ste01-deploy-readiness`  
**Mode:** docs-first recovery execution (no execution stop on missing resources)

---

## 0) Evidence IDs Registry (this wave)

| Evidence ID | Scope | Deterministic Source |
|---|---|---|
| EV-P04-MO038-SEARCH-001 | MO-038 search in-repo | `rg "MO-038|MO038|MO 038"` over repo (no direct primary artifact found) |
| EV-P04-MO038-RESTATED-001 | MO-038 restated edition | This file, section 1.2 |
| EV-P04-CORPUS-LIVE-001 | live ingested corpus now | `onx.selfVerify` live snapshot (`corpus.rawTotal`, `uniqueByTitleBody`) |
| EV-P04-CORPUS-GAP-001 | 19,012 external gap | `docs/CORPUS_GAP_REPORT.md:11-15,49-51` + `docs/OPERATIONS_RUNBOOK.md:194-247` |
| EV-P04-PROVIDERS-LIVE-001 | providers.status live snapshot | `GET /api/trpc/providers.status` عبر البوابة |
| EV-P04-PROVIDERS-CONTRACT-001 | liveValidate fail-closed keyless | `providers.liveValidate` keyless returns `401 BRIDGE_UNAUTHORIZED` |
| EV-P04-SMOKE-STRICT-001 | strict smoke 9/9 | `npm run smoke:live` with EXPECT_COMMIT + RL persistence + parity base |
| EV-P04-GATES-LOCAL-001 | local deterministic chain | `check + test + guard + verify:self + verify:corpus + eval:golden` |

---

## 1) AC-1 (MO-038): Recovery Search + Restated Edition

### 1.1 Recovery search inside available scope

- **Result:** primary MO-038 artifact is **not present as a direct file/token** in this repository snapshot.
- **Deterministic search evidence:** `EV-P04-MO038-SEARCH-001`.
- **Related recoverable references found:** corpus/external-source records tied to REC-06 and 19,012 archive context in:
  - `docs/CORPUS_GAP_REPORT.md:11-15,49-51`
  - `docs/OPERATIONS_RUNBOOK.md:194-247`
  - `docs/ONX_MASTER_EXECUTION_DOCUMENT_v3.0.md:22,158`
  - `docs/ONX_UNIFICATION_PLAN.md:27`

### 1.2 MO-038 Restated Edition (generated because primary artifact unavailable)

**Restated edition ID:** `MO-038-RST-STE-P04-v1`  
**Evidence ID:** `EV-P04-MO038-RESTATED-001`

**Restated statement (truthful and scope-bound):**
1. Recover searchable provenance for MO-038 intent داخل النطاق المتاح محلياً.
2. Where origin artifact is absent, produce a deterministic restated edition with explicit missing-resource labeling (no fabrication).
3. Attach active recovery actions (owner + retry schedule + measurable completion signal).
4. Continue execution without blocking on unavailable external artifact.

**New artifact produced in this wave:** this tracking document (`docs/STE_P04_RECOVERY_TRACK.md`) as the restated execution carrier for MO-038 recovery state.

---

## 2) AC-2 (Corpus): Actual ingest now vs external 19,012 + retry schedule

### 2.1 Measured live now (what is ingested **actually**)

Evidence: `EV-P04-CORPUS-LIVE-001`

| Metric | Live measured value |
|---|---|
| `corpus.rawTotal` | `22500` |
| `corpus.uniqueByTitleBody` | `22500` |
| `corpus.persistence` | `POSTGRES` |
| `onx.selfVerify.truthLedgerSummary.count` | `76` |
| `truthHistory.latestCreatedAt` | `2026-07-15T03:30:08.864Z` |
| `truthHistory.retention.keep` | `168` |
| `truthHistory.retention.oldestRetainedIsGenesis` | `true` |

### 2.2 Gap against external 19,012 archive target

Evidence: `EV-P04-CORPUS-GAP-001`

- **External target context:** founder REC-06 archive (`19,012` docs) is referenced but not present in this repository.
- **Truth now:** current live ingest is seeded corpus (`22500`) not the external authentic REC-06 archive.

### 2.3 Active recovery actions (no blocking)

| Gap | Owner | Action now | Retry cadence | Next retry (UTC) | Completion signal |
|---|---|---|---|---|---|
| Missing REC-06 authentic archive (19,012) | Coordinator / Founder intake | Re-open acquisition request with checksum + source URI requirements | Every 24h | 2026-07-16T03:50:00Z | Artifact delivered + checksum verified + ingestion run logged |
| Missing `onx-database.db` / `knowledge-seed-15k.json` from referenced source repo | Repo recovery owner (cross-repo) | Cross-repo export/import request with immutable SHA proof | Every 12h | 2026-07-15T15:50:00Z | Files present in workspace + hash recorded + dry-ingest pass |
| Provenance transition DEMO→REAL not yet measured | Intelligence ops | Run corpus manifest verification after each recovery drop | On each new drop | Event-driven | `corpusDisclosure` flips by measurement (never by manual claim) |

---

## 3) AC-3 (Providers): adapter + contract status (keyless/live) with evidence IDs per provider

### 3.1 Provider adapter model (code contract)

Evidence: `EV-P04-PROVIDERS-CONTRACT-001`

- Registry tri-state: `MISSING_KEY | CONFIGURED_UNPROBED | VALIDATED` in `api/lib/provider-registry.ts:5-12,68-90`.
- Live probe path exists but is bridge-guarded (`providers.liveValidate`) in `api/providers-router.ts:25-33`.
- Keyless mutation probe returns `401 BRIDGE_UNAUTHORIZED` (fail-closed preserved).

### 3.2 Live providers snapshot (keyless readable status)

Evidence: `EV-P04-PROVIDERS-LIVE-001`

| Provider | Adapter status (live) | Contract path status | Evidence ID |
|---|---|---|---|
| openai | `CONFIGURED_UNPROBED` (`keyPrefix=sk-p`) | `providers.status` readable; `providers.liveValidate` requires bridge key | EV-P04-PROV-OPENAI-001 |
| anthropic | `MISSING_KEY` | same contract behavior | EV-P04-PROV-ANTHROPIC-001 |
| google | `MISSING_KEY` | same contract behavior | EV-P04-PROV-GOOGLE-001 |
| groq | `MISSING_KEY` | same contract behavior | EV-P04-PROV-GROQ-001 |
| deepseek | `MISSING_KEY` | same contract behavior | EV-P04-PROV-DEEPSEEK-001 |
| qwen | `MISSING_KEY` | same contract behavior | EV-P04-PROV-QWEN-001 |
| llama | `MISSING_KEY` | same contract behavior | EV-P04-PROV-LLAMA-001 |
| kimi | `MISSING_KEY` | same contract behavior | EV-P04-PROV-KIMI-001 |

### 3.3 Active provider recovery actions (no blocking)

| Gap | Owner | Action now | Retry cadence | Next retry (UTC) | Completion signal |
|---|---|---|---|---|---|
| OpenAI configured but unprobed | Secrets owner + bridge owner | Run authorized `providers.liveValidate` with bridge key in controlled window | Every 8h | 2026-07-15T11:50:00Z | provider status becomes `VALIDATED` with `validatedAt/latency/modelCount` |
| 7 providers missing keys | Secrets owner | staged key provisioning by priority (anthropic/google first) | Every 24h | 2026-07-16T03:50:00Z | status transitions from `MISSING_KEY` to `CONFIGURED_UNPROBED/VALIDATED` |
| No live validated set persisted across restarts | Provider ops | scheduled post-boot re-validation run (authorized) | Every boot + 24h | Event-driven | deterministic validation log captured each boot |

---

## 4) Live measurement (pre-write parity)

| Surface | Measured |
|---|---|
| direct `/health` | `ALIVE`, `env=production`, `commit=e7dad64373e142cb1909905d8e617944b83deff3` |
| gateway `/intelligence/health` | `ALIVE`, `env=production`, `commit=e7dad64373e142cb1909905d8e617944b83deff3` |
| truth summary | `count=76`, `persistence=POSTGRES`, `capturedAt=2026-07-15T03:30:08.864Z` |
| truth history latest | `2026-07-15T03:30:08.864Z` (age≈19m), `retention keep=168`, `genesis=true` |
| scheduler sample | `total=5`, `active=2`, `failing=0`, `pulse intervalHuman=1m`, `runCount=515`, `HEALTHY` |

---

## 5) Deterministic validation bundle (this wave)

- `EV-P04-GATES-LOCAL-001`: local chain to remain green.
- `EV-P04-SMOKE-STRICT-001`: strict smoke on served commit with:
  - `EXPECT_COMMIT=e7dad64`
  - `EXPECT_RL_PERSISTENCE=POSTGRES_PERSISTED`
  - `PARITY_BASE_URL=https://onx-intelligence-clean.onrender.com`

---

## 6) Post-commit evidence (filled after execution)

- **Commit SHA:** `TBD`
- **Truth Gates run:** `TBD`
- **Artifact SHA-256 (`docs/STE_P04_RECOVERY_TRACK.md`):** `TBD`

