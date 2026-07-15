# STE-P-20 External Gate Recovery Pack

**IU:** STE-P-20  
**Tier:** 2  
**Branch:** `onxos-ste01-deploy-readiness`  
**Artifact:** `onx-intelligence-clean/docs/STE_P20_EXTERNAL_GATE_RECOVERY_PACK.md`

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

## 1) External prerequisites inventory (final, exact)

| Gate | External prerequisite(s) required for closure | Current state | Verdict |
|---|---|---|---|
| item A secret gate (`providers.liveValidate` authorized path) | Valid `x-onx-bridge-key` value (`BRIDGE_SHARED_SECRET`) available to request executor | Missing in current envelope (latest live outcome 401) | `UNPROVEN` |
| item A keys gate (provider readiness) | Provider API keys for: `anthropic,google,groq,deepseek,qwen,llama,kimi` | 7 keys missing; validated count=0 | `UNPROVEN` |
| item B archive gate (authentic REC-06 proof) | Authentic `onx-database.db` + `knowledge-seed-15k.json` delivered locally with checksums/provenance | Both files absent in scope | `UNPROVEN` |

Baseline evidence anchors: `docs/STE_P19_NEXT_WINDOW_GATE_EXECUTION.md:41-43`.

---

## 2) External blocker -> executable recovery action mapping

| Gate | Atomic blocker | Recovery action (executable, not descriptive) | Owner | Retry UTC |
|---|---|---|---|---|
| item A secret gate | no valid bridge secret in execution envelope | Inject `x-onx-bridge-key` in controlled retry call, execute one `providers.liveValidate`, persist raw JSON output | Bridge secret owner | `2026-07-15T14:55:00Z` |
| item A keys gate | 7 provider keys missing | Provision listed keys, then execute `providers.status` and one authorized `providers.liveValidate`, persist both outputs | Secrets owner | `2026-07-16T06:55:00Z` |
| item B archive gate | REC-06 artifacts missing | Deliver two files, compute SHA-256 for both, execute ingest batches, capture post-check (`selfVerify` + manifest) | Archive delivery owner | `2026-07-16T06:55:00Z` |

---

## 3) Next retry probe contracts (per gate)

### Gate A secret gate

- **Probe contract**
  - `POST /api/trpc/providers.liveValidate`
  - Headers: `content-type: application/json`, `x-onx-bridge-key: <BRIDGE_SHARED_SECRET>`
  - Body: `{"json":{}}`
- **Expected success output shape**
  - `result.data.json[]` with at least one entry where `status="VALIDATED"` and fields `latencyMs`, `modelCount`.
- **Required evidence paths for PROVEN**
  - `docs/STE_P20_EXTERNAL_GATE_RECOVERY_PACK.md` (new attempt row)
  - output artifact reference from retry execution log

### Gate A keys gate

- **Probe contract**
  - `GET /api/trpc/providers.status?input=%7B%22json%22%3A%7B%7D%7D`
  - Follow-up: authorized `providers.liveValidate` once.
- **Expected success output shape**
  - `missingKey=0` and/or `validated>0`, with provider rows reflecting `VALIDATED` where probe succeeded.
- **Required evidence paths for PROVEN**
  - same artifact row + captured status JSON + captured liveValidate JSON

### Gate B archive gate

- **Probe contract**
  1. Presence probe for `onx-database.db`, `knowledge-seed-15k.json`
  2. SHA-256 probe for both files
  3. ingest call(s) + post-check via `onx.selfVerify` (and manifest where applicable)
- **Expected success output shape**
  - Presence: `{dbPresent:true, seedPresent:true}`
  - Ingest: `{accepted:number, duplicates:number, total:number, persistence:string}`
  - Post-check: deterministic corpus/provenance counters reflecting authentic archive ingestion.
- **Required evidence paths for PROVEN**
  - artifact presence/hash rows + ingest response rows + post-check rows captured in next gate execution artifact

---

## 4) Promotion lock (UNPROVEN -> PROVEN)

A gate remains `UNPROVEN` unless new live probe evidence is produced on current head and that head has successful Truth Gates with headSha match.

Current wave introduces no new closure evidence; all three gates remain `UNPROVEN`.

---

## 5) Delta counts (P-19 -> P-20)

| Metric | Before (P-19) | After (P-20) | Delta |
|---|---:|---:|---:|
| Residual gates | 3 | 3 | 0 |
| PROVEN | 0 | 0 | 0 |
| UNPROVEN | 3 | 3 | 0 |

---

## 6) Head/run binding context

- Latest accepted head/run used as deterministic baseline: `5ed39e7` / `29392520423` (head-matched).
- Current working head at pack generation start: `5ed39e71a4d40c93f9e349d45d814c30210b7952` (`UTC=2026-07-15T05:58:43Z`).

---

## 7) Post-commit tuple (P-20)

- **Commit SHA:** `TBD`
- **Truth Gates run:** `TBD`
- **headSha matched:** `TBD`

