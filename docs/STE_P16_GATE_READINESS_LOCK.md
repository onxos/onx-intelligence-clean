# STE-P-16 Gate Readiness Lock

**IU:** STE-P-16  
**Tier:** 2  
**Branch:** `onxos-ste01-deploy-readiness`  
**Artifact:** `onx-intelligence-clean/docs/STE_P16_GATE_READINESS_LOCK.md`

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

## 1) Readiness-lock verification (remaining gates only)

| Gate | Executed probe(s) | Live output | Verdict | What is missing beyond external blockers? |
|---|---|---|---|---|
| item A secret gate | keyless `providers.liveValidate` | `401 BRIDGE_UNAUTHORIZED`, `path=providers.liveValidate` | `UNPROVEN` | **Nothing internal** beyond external secret availability (`x-onx-bridge-key`) |
| item A keys gate | `providers.status` | `validated=0`, `configuredUnprobed=1`, `missingKey=7` with explicit ids | `UNPROVEN` | **Nothing internal** beyond external provider secret provisioning |
| item B archive gate | file presence (`onx-database.db`,`knowledge-seed-15k.json`) + corpus context | `{dbPresent:false, seedPresent:false}` and live corpus still seed-backed (`22500/22500`) | `UNPROVEN` | **Nothing internal** beyond external archive artifact delivery |

Source-state head/run for probes: `b08f8c8` / `29391328892` (head-matched success).

---

## 2) Probe bindings for next retry window (executable)

### Gate A — secret gate (`providers.liveValidate` authorized path)

- **Retry probe command:**
  - `curl -s -X POST "https://onx-gateway.onrender.com/intelligence/api/trpc/providers.liveValidate" -H "content-type: application/json" -H "x-onx-bridge-key: <BRIDGE_SHARED_SECRET>" -d "{\"json\":{}}"`
- **Expected success output shape:** envelope with `result.data.json[]`, at least one provider with `status="VALIDATED"` plus `latencyMs/modelCount`.
- **Evidence ID shape:** `EV-P16-A-SECRET-RETRY-<N>`
- **Blocker (atomic):** missing valid bridge secret in execution envelope.
- **Retry UTC:** `2026-07-15T14:15:00Z`

### Gate A — keys gate (provider secrets readiness)

- **Retry probe command:**
  - `curl -s "https://onx-gateway.onrender.com/intelligence/api/trpc/providers.status?input=%7B%22json%22%3A%7B%7D%7D"`
- **Expected success output shape:** aggregate/state where `missingKey=0` and/or `validated>0` after authorized validation.
- **Evidence ID shape:** `EV-P16-A-KEYS-RETRY-<N>`
- **Blocker (atomic):** missing provider API keys (anthropic, google, groq, deepseek, qwen, llama, kimi).
- **Retry UTC:** `2026-07-16T06:15:00Z`

### Gate B — archive gate (authentic REC-06 proof)

- **Retry probe commands:**
  1. Presence check for `onx-database.db` and `knowledge-seed-15k.json`.
  2. SHA-256 check on both artifacts.
  3. Ingest + post-check (`onx.selfVerify` corpus block).
- **Expected success output shapes:**
  - presence: `{dbPresent:true, seedPresent:true}`
  - ingest: `{accepted, duplicates, total, persistence}`
  - post-check: corpus/provenance values consistent with authentic archive ingestion.
- **Evidence ID shape:** `EV-P16-B-ARCHIVE-RETRY-<N>`
- **Blocker (atomic):** external archive artifacts not delivered into repository scope.
- **Retry UTC:** `2026-07-16T06:15:00Z`

---

## 3) Deterministic proof rule

No gate is marked `PROVEN` unless a live retry probe produces success output on a head with successful Truth Gates and headSha match.

---

## 4) Delta counts (P-15 -> P-16)

| Metric | Before (P-15) | After (P-16) | Delta |
|---|---:|---:|---:|
| Remaining gates | 3 | 3 | 0 |
| PROVEN | 0 | 0 | 0 |
| UNPROVEN | 3 | 3 | 0 |

---

## 5) Contract anchors

- providers guard contract: `api/providers-router.ts:5,11,26`
- archive seed contract: `scripts/seed-corpus.ts:13`
- live context commit parity: direct/gateway `/health` commit=`b08f8c8b23c6986c0f016ab71c4a2b2348bc3c43`

---

## 6) Post-commit tuple (P-16)

- **Commit SHA:** `TBD`
- **Truth Gates run:** `TBD`
- **headSha matched:** `TBD`

