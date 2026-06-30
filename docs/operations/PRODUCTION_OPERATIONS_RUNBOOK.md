# ONX Intelligence Production Operations Runbook

This runbook documents reproducible production operations from this repository only.

## Preconditions

- Docker available for containerized runtime.
- Environment variables set:
  - `DATABASE_URL`
  - `JWT_SECRET`
  - `NODE_ENV=production`
  - `PORT` (default `10000` in container)

## Startup

1. Build image:
   - `docker build -t onx-intelligence-clean .`
2. Start with Compose:
   - `docker compose up -d`
3. Verify health and readiness:
   - `curl -fsS http://localhost:3000/health`
   - `curl -fsS http://localhost:3000/health/readiness`
   - `curl -fsS http://localhost:3000/health/liveness`

## Shutdown

- Stop services cleanly:
  - `docker compose down`

## Restart

- Application + database restart:
  - `docker compose down`
  - `docker compose up -d`

## Backup

- Create SQL backup (gzip):
  - `DATABASE_URL=<postgres-url> bash scripts/backup.sh`
- Output: path to generated `.sql.gz` file under `./backups` unless overridden.

## Restore

- Restore from backup file:
  - `DATABASE_URL=<postgres-url> bash scripts/restore.sh backups/<file>.sql.gz`

## CI / Build / Tests / Smoke

- Full CI-equivalent validation:
  - `npm run ci`
- Smoke validation:
  - `BASE_URL=http://localhost:3000 bash scripts/smoke.sh`

## Monitoring and Diagnostics

- Health: `GET /health`
- Readiness: `GET /health/readiness`
- Liveness: `GET /health/liveness`
- Audit visibility: `GET /monitoring/audit`
- Commit/runtime metadata: `GET /commit`

## Failure Recovery Sequence

1. Confirm health status and endpoint responsiveness.
2. If database is unavailable, expect degraded health/readiness and `503` on DB-dependent auth operations.
3. Restart services using the restart sequence above.
4. Re-run smoke and audit checks.

## Notes

- Production startup requires `JWT_SECRET`; process fails fast without it.
- Runtime supports degraded mode when `DATABASE_URL` is unavailable.
