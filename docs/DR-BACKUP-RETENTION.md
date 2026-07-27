# IU-P0-6 — PostgreSQL Backup & Restore Policy

This supersedes the aspirational parts of `DISASTER_RECOVERY.md`. It describes
what the system actually does, and it deliberately distinguishes a **backup**
from a **diagnostic**.

## What was wrong before

Two Render cron jobs existed and neither was a backup:

| Cron | ID | What it actually ran |
|---|---|---|
| `onx-pg-backup` | `crn-d9drfi3bc2fs73enoos0` | `which pg_dump` — a path check |
| `onx-pg-backup-docker` | `crn-d9ibkdnlk1mc73cqimhg` | `f9-diagnostics.mjs` — a diagnostic |

Neither produced an artifact. A diagnostic that proves `pg_dump` is on `$PATH`
is not a backup and must never be reported as one.

## What runs now

`crn-d9ibkdnlk1mc73cqimhg` builds `Dockerfile.pgops` and runs
`scripts/onx-pg-ops.mjs`, which performs a genuine
`pg_dump --format=custom` of each target database.

### Why a Render cron rather than a CI runner

A Render Cron Job executes **inside Render's private network** and connects to
each database over its **internal hostname**. Consequently:

- no IP allowlist entry is required,
- no temporary `/32` is opened,
- no production network configuration is modified,
- the backup does not depend on any allowlist maintenance window.

Driving `pg_dump` from a GitHub Actions runner would require punching a hole in
the production allowlist for an ephemeral, shared-tenancy IP. That is strictly
worse and is not done.

## Scope

| Database | Resource ID | In scope |
|---|---|---|
| platform | `dpg-d96t4pkvikkc73d76okg-a` | yes |
| marketing | `dpg-d98upmu7r5hc73afti50-a` | yes |
| intelligence | `dpg-d86s3uog4nts73b9j4sg-a` | **NO — hard denylist** |

The intelligence database is in `EXCLUDED_DB_IDS` in `scripts/onx-pg-ops.mjs`.
The script aborts if it ever appears as a dump target or a restore target, and
the workflow asserts the same before it does anything.

## Artifact contract

```
<UTC timestamp>_<database resource id>_pg<major>.dump
20260727T113000Z_dpg-d96t4pkvikkc73d76okg-a_pg16.dump
```

Object-storage layout:

```
onx-pg-backups/<dbResourceId>/<YYYY>/<MM>/<DD>/<artifact>
onx-pg-backups/<dbResourceId>/<YYYY>/<MM>/<DD>/<artifact>.manifest.json
onx-pg-backups/<dbResourceId>/<YYYY>/<MM>/<DD>/<artifact>.sha256
onx-pg-backups/<dbResourceId>/latest.manifest.json
onx-pg-backups/_run-history/<dbResourceId>/<stamp>_<runId>.json
onx-pg-backups/_restore-drills/<dbResourceId>/<stamp>_<runId>.json
```

Each artifact carries a **SHA-256** recorded in three places: the log line, the
sidecar `.sha256`, and the manifest. The manifest also records the source
integrity fingerprint (schema/table/view/sequence/index/constraint/column
counts, exact per-table row counts, and a SHA-256 of the ordered
`schema.table.column:type` list). That fingerprint is what the restore drill
compares against. `pg_dump` and every fingerprint query use the **same exported
read-only PostgreSQL snapshot**. Live writes after that snapshot therefore
cannot attach counts to the manifest that were never present in the dump.

## Encryption

- **In transit** — the script refuses to run unless `S3_ENDPOINT` is `https://`.
  The database connection itself never leaves Render's private network.
- **At rest** — uploads request SSE-S3 (`AES256`). If the provider rejects the
  header the upload falls back to the bucket's provider-managed at-rest
  encryption (Cloudflare R2 encrypts every object at rest unconditionally) and
  the manifest records which of the two applied.

## Retention policy

- Retention window: **90 days** (`ONX_RETENTION_DAYS`).
- Run history and restore-drill records under `_run-history/` and
  `_restore-drills/` are **never** subject to retention deletion.
- **Enforcement is OFF.** `ONX_RETENTION_ENFORCE` defaults to `false`, and the
  retention pass is a **dry run**: it counts and names what a 90-day policy
  *would* remove and **deletes nothing**.
- Enforcement may only be switched to `true` after the retention policy is
  proven — that is, after a documented restore drill has demonstrated that a
  90-day-old artifact is still restorable. Until then, nothing existing is
  deleted for any reason.

This is a deliberate reversal of the previous `backup-pg.mjs`, which deleted
everything past the newest 30 dumps before any restore had ever been proven.

## Run history and failure alerting

- Every run — pass or fail — writes a JSON record under `_run-history/`.
- Any failure calls `process.exit(1)`, which marks the Render cron run failed
  and fires Render's own cron-failure notification.
- A greppable `ONX_BACKUP_ALERT {json}` line is emitted on stderr.
- If `ONX_ALERT_WEBHOOK` is set, the same payload is POSTed to it.
- The script has no silent-success path: a failed dump, a short artifact, an
  unreadable archive, or a failed upload each abort the run.

## Restore drill

`iu-p0-6-pg-backup.yml` mode `restore`:

1. Starts a no-data `self-check` one-off job and compares the SHA-256 of
   `scripts/onx-pg-ops.mjs` inside the deployed Render image with the SHA-256
   of that file in the exact workflow commit. A stale image aborts here,
   before env mutation or database creation.
2. Creates a **new, isolated, non-production** Render Postgres instance named
   `onx-restore-test-<stamp>`, pinned to the **same major version** as the
   source and in the source database's region. The workflow requires a backup
   cron in that same region; it never falls back to an external connection.
   A dated object key is parsed for its source resource ID. The `latest`
   pointer requires an explicit `source_db_id`, and only the platform and
   marketing resource IDs are accepted.
3. Downloads the artifact and its manifest, and **fails if the SHA-256 or the
   byte size disagrees with the manifest**.
4. Refuses to proceed if the restore target host matches any production host in
   `ONX_PROD_HOST_DENY`, or resolves to the excluded intelligence database.
5. Verifies the resource name, database name, resource ID and an empty
   pre-restore catalogue, then runs `pg_restore --no-owner --no-privileges
   --exit-on-error` into that isolated instance.
6. Recomputes the integrity fingerprint on the restored instance and compares
   schema/table/view/sequence/index/constraint/column counts, exact per-table
   row counts, and the schema SHA-256 against the manifest.
7. Records non-PII samples: table names, row counts and column counts for the
   five largest tables. **No row values are ever read or stored.**
8. Writes the full report to `_restore-drills/` **before** any teardown.

`retrieve` is a separate, non-database operation. It retrieves one canonical
`_restore-drills/...json` object, validates that it is an IU-P0-6 `PASS`, binds
its source and restore-target resource IDs, and rechecks checksum, schema,
catalogue counts, total rows and per-table row equality. It emits the object's
own SHA-256 as `ONX_RESTORE_EVIDENCE`; it never trusts a prior console line.

Teardown is a separate, explicitly confirmed mode (`teardown`,
`confirm_teardown=DELETE`) and requires both `test_db_id` and the exact
`restore_evidence_key`. Before DELETE it performs the same independent durable
evidence retrieval and fails closed unless the evidence is a `PASS` for that
exact test database. It refuses anything not named `onx-restore-test-*`, and
refuses the platform, marketing and intelligence resource IDs. After Render
accepts DELETE, the workflow polls the database resource until `GET` returns
404; a merely accepted DELETE is not reported as successful teardown.

## What this never does

No `db push`, no DDL against production, no migration, no production write of
any kind, no allowlist change, and no printing or generation of secrets. The
only production access is `pg_dump` plus read-only catalogue `SELECT`s.
