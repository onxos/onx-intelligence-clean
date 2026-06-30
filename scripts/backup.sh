#!/usr/bin/env bash
set -euo pipefail

if [[ -z "${DATABASE_URL:-}" ]]; then
  echo "DATABASE_URL is required" >&2
  exit 1
fi

sanitize_database_url() {
  local url="$1"
  if [[ "$url" != *"?"* ]]; then
    echo "$url"
    return
  fi

  local base="${url%%\?*}"
  local query="${url#*\?}"
  local filtered
  filtered="$(printf '%s' "$query" | awk -F'&' '
    BEGIN { OFS = "&" }
    {
      out = ""
      for (i = 1; i <= NF; i++) {
        if ($i != "" && $i !~ /^schema=/) {
          out = (out == "" ? $i : out OFS $i)
        }
      }
      print out
    }
  ')"

  if [[ -n "$filtered" ]]; then
    echo "$base?$filtered"
    return
  fi

  echo "$base"
}

SANITIZED_DATABASE_URL="$(sanitize_database_url "$DATABASE_URL")"

BACKUP_DIR="${BACKUP_DIR:-./backups}"
TIMESTAMP="$(date -u +%Y%m%dT%H%M%SZ)"
BACKUP_FILE="${BACKUP_FILE:-$BACKUP_DIR/onx-intelligence-$TIMESTAMP.sql.gz}"

mkdir -p "$BACKUP_DIR"

dump_with_local_client() {
  pg_dump "$SANITIZED_DATABASE_URL" | gzip -c > "$BACKUP_FILE"
}

dump_with_docker_client() {
  docker run --rm --network host \
    -e DATABASE_URL="$SANITIZED_DATABASE_URL" \
    postgres:16-alpine \
    sh -lc 'pg_dump "$DATABASE_URL"' | gzip -c > "$BACKUP_FILE"
}

if command -v pg_dump >/dev/null 2>&1; then
  dump_with_local_client
elif command -v docker >/dev/null 2>&1; then
  dump_with_docker_client
else
  echo "pg_dump not found and docker is unavailable; cannot perform backup" >&2
  exit 1
fi

if [[ ! -s "$BACKUP_FILE" ]]; then
  echo "Backup failed: output file is empty" >&2
  exit 1
fi

echo "$BACKUP_FILE"
