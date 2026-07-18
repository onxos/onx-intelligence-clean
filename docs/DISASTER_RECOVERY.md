# ONX Disaster Recovery Plan (DR-01)

## Targets
| Metric | Target | Mechanism |
|---|---|---|
| RPO (max data loss) | 24h | Daily `pg_dump` cron → S3 (see `scripts/backup-pg.mjs`) |
| RTO (max restore time) | 2h | Fresh Render Postgres + restore latest dump + redeploy |
| Config loss | 0 | All infra in `render.yaml` + env var inventory below |

## What is protected
- **PostgreSQL** (single source of truth): knowledge corpus (15.3K records),
  evidence registry, domain tables (D01-D18), IUC/continuity log, truth ledger,
  agents registry, governance decisions, consciousness cycles.
- **Code**: GitHub `onxos/onx-intelligence-clean` (main) — immutable history.
- **Secrets**: Render dashboard env vars (inventory in §4 — values live only in Render).

## Daily backup
Render Cron Job `onx-pg-backup` (render.yaml) runs `scripts/backup-pg.mjs`
daily at 03:00 UTC → gzipped dump → S3 bucket (`S3_BUCKET` + AWS creds).
Without S3 env the job still produces and verifies the dump and logs a loud
warning — configure the bucket to make off-box retention real (14 dumps).

## Restore drill (test quarterly)
1. Create new Render Postgres (`onx-pg-restore-test`).
2. `gunzip < latest.sql.gz | psql $NEW_DATABASE_URL`
3. Point staging service `DATABASE_URL` at the restore; verify
   `corpusQuery.realCounts` ≥ 15,345 and `evidenceRegistry.stats.total` = 74.
4. Destroy the test instance. Record the drill date in the evidence registry.

## Failure runbook
| Scenario | Action |
|---|---|
| Web service down | Render auto-restarts; if bad deploy → rollback to previous deploy in dashboard |
| Postgres down | Render managed recovery; if instance lost → §3 restore from latest dump |
| Bad migration | Every load is idempotent; `ON CONFLICT DO NOTHING`; reverse by batch id |
| Secret leak | Rotate in Render dashboard (DATABASE_URL, OPENAI_API_KEY, BRIDGE_SHARED_SECRET) — no code change needed |

## Env var inventory (names only — values in Render)
DATABASE_URL, OPENAI_API_KEY, BRIDGE_ENABLED, BRIDGE_SHARED_SECRET, NODE_ENV,
MOYASAR_SECRET_KEY (optional), SENTRY_DSN (optional), S3_BUCKET + AWS_* (backup).
