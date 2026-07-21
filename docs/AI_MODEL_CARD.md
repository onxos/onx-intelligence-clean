# ONX Intelligence — AI Model Card

_Concise model card for the AI decision surfaces (H-7). Complements the
runtime explainability log recorded for every model invocation._

## Overview

| Field | Value |
|-------|-------|
| System | ONX Intelligence — Titan reasoning brain |
| Primary model | OpenAI `gpt-4o` (`api/ai-brain-router.ts`) |
| Provider | OpenAI (via `OPENAI_API_KEY`; mock fallback when unset) |
| Sampling | temperature `0.7`, `max_tokens` `1500` |
| Languages | Arabic (primary), English |
| Governance | ONX 7-principle constitution + fail-closed SECH gate |

## Intended use

- Founder/operator strategic, knowledge, governance, and operational
  assistance via the five Titan personas (Prometheus, Athena, Zeus, Hermes,
  Apollo).
- **Not** a source of legal, medical, or financial authority on its own —
  outputs are advisory and subject to the constitutional gate.

## Inputs & outputs

- **Input:** a natural-language query plus retrieved memory context
  (short/long-term memories grounded to the user & titan).
- **Output:** a natural-language answer **plus an explainability envelope**:
  `model`, `temperature`, `maxTokens`, `tokensUsed`, `evidenceTier`,
  `evidenceItems`, and a `reasoning` string.

## Explainability (H-7)

Every invocation is recorded by `api/lib/ai-decision-log.ts` with:

| Field | Meaning |
|-------|---------|
| `model` | exact model id used |
| `temperature` | sampling temperature actually used |
| `tokensUsed` | total tokens reported by the provider |
| `evidenceTier` | `T1`–`T4` — how much grounded context backed the answer |
| `reasoning` | short basis: titan, routing method, evidence count |

Evidence tiers (mirroring the USFIP ISES tiers):

- **T1** — ≥ 5 grounded context items
- **T2** — 2–4 grounded context items
- **T3** — exactly 1 grounded context item
- **T4** — ungrounded / no supporting memory

Records are queryable via `aiBrain.decisionLog` and `aiBrain.decisionStats`,
and emitted as structured `ai.decision` log lines for the log pipeline.

## Limitations & risks

- May produce plausible-but-wrong content (hallucination); the evidence tier
  signals grounding strength but is not a correctness guarantee.
- Depends on OpenAI availability; falls back to mock behaviour when the API
  key is absent.
- Memory grounding quality depends on prior interactions stored per user.

## Governance & safeguards

- Constitutional SECH gate (`api/lib/sech-gate.ts`) is **deny-by-default**.
- RBAC enforced on sensitive routes (`api/lib/rbac.ts`).
- All AI decisions are logged and auditable (this card + the decision log).
