#!/bin/sh
set -e

echo "[entrypoint] Preparing Prisma client and database schema"
npx prisma generate
npx prisma db push --accept-data-loss
npx prisma migrate deploy

if [ "$#" -gt 0 ]; then
  exec "$@"
fi

exec node dist/src/main.js
