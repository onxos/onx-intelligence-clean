#!/usr/bin/env bash
set -euo pipefail

if [[ $# -lt 1 ]]; then
  echo "Usage: DATABASE_URL=... bash scripts/restore.sh <backup.sql.gz>" >&2
  exit 1
fi

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

BACKUP_FILE="$1"
if [[ ! -f "$BACKUP_FILE" ]]; then
  echo "Backup file not found: $BACKUP_FILE" >&2
  exit 1
fi

restore_with_local_client() {
  gunzip -c "$BACKUP_FILE" | psql "$SANITIZED_DATABASE_URL"
}

restore_with_docker_client() {
  gunzip -c "$BACKUP_FILE" | docker run --rm -i --network host \
    -e DATABASE_URL="$SANITIZED_DATABASE_URL" \
    postgres:16-alpine \
    sh -lc 'psql "$DATABASE_URL"'
}

if command -v psql >/dev/null 2>&1; then
  restore_with_local_client
elif command -v docker >/dev/null 2>&1; then
  restore_with_docker_client
else
  echo "psql not found and docker is unavailable; cannot perform restore" >&2
  exit 1
fi

echo "restore_complete"
