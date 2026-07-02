#!/bin/sh
set -e

echo "[entrypoint] Preparing Prisma client and database schema"
npx prisma generate
npx prisma db push --accept-data-loss
# `db push` above already syncs the full schema. `migrate deploy` is best-effort:
# on a db-push-populated database the hand-authored migrations can hit P3009
# (a prior failed/again migration record), which must NOT block boot since the
# schema is already correct.
npx prisma migrate deploy || echo "[entrypoint] migrate deploy skipped (schema already synced via db push)"

if [ "$#" -gt 0 ]; then
  exec "$@"
fi

exec node dist/src/main.js
