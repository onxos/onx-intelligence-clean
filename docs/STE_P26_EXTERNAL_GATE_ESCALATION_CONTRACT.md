# STE-P-26 External Gate Escalation Contract

**IU:** STE-P-26  
**Tier:** 2  
**Branch:** `onxos-ste01-deploy-readiness`  
**Artifact:** `onx-intelligence-clean/docs/STE_P26_EXTERNAL_GATE_ESCALATION_CONTRACT.md`

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

## 1) Residual gates baseline (carried from latest run-backed wave)

Baseline source: `docs/STE_P25_RETRY_WINDOW_EXECUTION.md:30-34,42-44`  
Baseline head: `6bae5098850282bed9360452e8eec78015c46e4e`  
Reference UTC for escalation timing: `2026-07-15T06:52:19Z`

| Gate | Current state | Last run-backed blocker evidence | Verdict |
|---|---|---|---|
| item A secret gate | `providers.liveValidate` unauthorized from current envelope | `EV-P25-A-SECRET-001` (`-32001/401/path`) | `UNPROVEN` |
| item A keys gate | provider validation blocked by missing keys | `EV-P25-A-KEYS-001` (`validated=0`, `missingKey=7`) | `UNPROVEN` |
| item B archive gate | REC-06 artifacts absent in repo scope | `EV-P25-B-ARCHIVE-001` (`dbPresent=false`, `seedPresent=false`) | `UNPROVEN` |

---

## 2) Escalation contract (owner-bound dependencies + blocker removal)

| Gate | Owner-bound dependency | Atomic unblock condition | Escalation action contract |
|---|---|---|---|
| item A secret gate | Bridge secret owner (controls `x-onx-bridge-key`) | valid key delivered to execution envelope | Owner provides secret channel; execute one authorized `providers.liveValidate`; persist raw JSON response |
| item A keys gate | Secrets owner (provider credentials vault) | all 7 provider keys present and readable by runtime | Owner provisions missing keys (`anthropic,google,groq,deepseek,qwen,llama,kimi`); execute `providers.status` then authorized `providers.liveValidate`; persist both outputs |
| item B archive gate | REC-06 archive delivery owner | authentic `onx-database.db` + `knowledge-seed-15k.json` delivered with provenance | Owner delivers artifacts + checksums; execute presence/hash probe then ingest path and `onx.selfVerify` post-check; persist outputs |

---

## 3) Evidence requirements for conversion to PROVEN

| Gate | Required evidence set (all mandatory) | Promotion condition |
|---|---|---|
| item A secret gate | authorized `providers.liveValidate` success envelope with `result.data.json[]` containing at least one `status="VALIDATED"` and probe metadata | `UNPROVEN -> PROVEN` only when success evidence is live and tied to current head |
| item A keys gate | `providers.status` showing `missingKey=0` and/or `validated>0` plus authorized `providers.liveValidate` results proving live provider validation | `UNPROVEN -> PROVEN` only with both status+validation evidence |
| item B archive gate | artifact presence/hash evidence (`dbPresent=true`,`seedPresent=true`, SHA-256 values), ingest output (`accepted/duplicates/total/persistence`), and post-check via `onx.selfVerify` showing archive-backed state | `UNPROVEN -> PROVEN` only with full artifact+ingest+post-check chain |

---

## 4) Measurable retry windows (per gate)

Reference UTC: `2026-07-15T06:52:19Z`.

| Gate | Retry UTC | Time-to-retry from reference | Probe contract at retry |
|---|---|---|---|
| item A secret gate | `2026-07-15T20:55:00Z` | `T+14h02m41s` | one authorized `providers.liveValidate` call + raw JSON capture |
| item A keys gate | `2026-07-16T12:55:00Z` | `T+30h02m41s` | `providers.status` then authorized `providers.liveValidate` + both outputs |
| item B archive gate | `2026-07-16T12:55:00Z` | `T+30h02m41s` | presence/hash + ingest + `onx.selfVerify` post-check |

---

## 5) State lock and delta counts

No new live closure probe was executed in this contract wave; all residual gates remain `UNPROVEN`.

| Metric | Before (P-25) | After (P-26) | Delta |
|---|---:|---:|---:|
| Residual gates | 3 | 3 | 0 |
| PROVEN (target set) | 0 | 0 | 0 |
| UNPROVEN (target set) | 3 | 3 | 0 |

---

## 6) Post-commit tuple (P-26)

- **Commit SHA:** `TBD`
- **Truth Gates run:** `TBD`
- **headSha matched:** `TBD`

