# ONX Intelligence — Deployment Guide

Operator-facing guide for deploying the ONX Intelligence service with the
compliance & security controls added under CRP-01. See
`docs/governance/CRP01_GAP_CLOSURE.md` for the full gap → control map.

---

## 1. Data residency (C-4)

Data residency is an **explicit, auditable configuration value**, not an
accident of where the container happens to run.

### Configuration

| Layer | What to set | Where |
|-------|-------------|-------|
| Application | `DATA_REGION` | `.env` / Render env / `render.yaml` |
| Infrastructure | hosting `region:` + database region | `render.yaml`, hosting dashboard |

`DATA_REGION` is read by `api/lib/env.ts` and validated against an approved
allowlist:

- `ksa-central` (default, in-Kingdom / Saudi Arabia — **preferred**)
- `ksa-riyadh` (in-Kingdom / Saudi Arabia — Riyadh)
- `me-central-1` (GCC — documented transfer basis required)
- `me-south-1` (GCC — documented transfer basis required)

At boot the service logs `boot.data_residency` with the region and whether it
is approved. A non-approved value is surfaced loudly.

### In-Kingdom residency plan

1. **Primary target:** provision the web service **and** its PostgreSQL
   database in an in-Kingdom (KSA) region and set `DATA_REGION=ksa-central`.
2. **Interim (GCC) basis:** the current `render.yaml` pins `region: frankfurt`
   for the pilot. Until the in-Kingdom region is provisioned, either:
   - move the services to a KSA/GCC region and update both the hosting
     `region:` and `DATA_REGION`; **or**
   - record the **legal basis for cross-border transfer** (data processing
     agreement + explicit controller approval) in the compliance register,
     and set `DATA_REGION` to the closest approved GCC region.
3. Keep `DATA_REGION` **in sync** with the actual infrastructure region — the
   value is an attestation, so a mismatch is a compliance finding.

> **Note:** application code cannot by itself force where bytes live; residency
> is ultimately enforced at the infrastructure layer (region of the web
> service, the database, and any object storage / backups). This control makes
> the intended region explicit, validated, and logged so drift is detectable.

---

## 2. Fail-closed production secrets (H-5)

In `production` (`NODE_ENV=production`) the service **refuses to start** when a
security-critical secret is missing or weak (`api/lib/env.ts`
`assertProductionSecrets()`, invoked from `api/boot.ts`). This prevents the
service from silently running with signature verification disabled.

### Always required in production

| Variable | Rule |
|----------|------|
| `APP_SECRET` | ≥ 32 chars, no `change-me` placeholder |
| `BRIDGE_SHARED_SECRET` | required **only when** `BRIDGE_ENABLED=true`; ≥ 32 chars |

### Webhook integration secrets (fail-closed when enabled)

Webhook signature verification must never "fail open". Each integration is
gated by an `<NAME>_ENABLED` flag; when enabled in production, its secret is
mandatory or boot fails:

| Enable flag | Required secret |
|-------------|-----------------|
| `TWILIO_ENABLED=true` | `TWILIO_AUTH_TOKEN` |
| `STRIPE_ENABLED=true` | `STRIPE_WEBHOOK_SECRET` |
| `SQUARE_ENABLED=true` | `SQUARE_WEBHOOK_SIGNATURE_KEY` |

Leave the `*_ENABLED` flags unset/false for integrations you are not using so
they do not block boot. All of these are documented in `.env.example`.

Secrets are **never** committed — set them via the hosting dashboard
(`sync: false` in `render.yaml`).

---

## 3. Standard deploy steps

```bash
npm ci
npm run build          # vite build + esbuild bundle of the server
NODE_ENV=production npm start
```

Health/readiness endpoints:

- `GET /health` — liveness + commit + region-aware boot info
- `GET /api/trpc/health.ping` — configured Render health check

---

## 4. Related documents

- `docs/AI_MODEL_CARD.md` — AI model card & explainability (H-7)
- `docs/OPERATIONS_RUNBOOK.md` — secret rotation policy (L-18) & operations
- `tests/load/README.md` — load-test scenarios & pass thresholds (M-15)
- `docs/governance/CRP01_GAP_CLOSURE.md` — full gap register mapping
