#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${BASE_URL:-${1:-}}"
EMAIL="${SMOKE_EMAIL:-smoke-$(date +%s)@onx.test}"
PASSWORD="${SMOKE_PASSWORD:-StrongPass123!}"
NAME="${SMOKE_NAME:-Smoke Test User}"

if [[ -z "$BASE_URL" ]]; then
  echo "Usage: BASE_URL=https://example.onrender.com bash scripts/smoke.sh" >&2
  exit 1
fi

if ! command -v jq >/dev/null 2>&1; then
  echo "jq is required for smoke validation" >&2
  exit 1
fi

request_json() {
  local method="$1"
  local path="$2"
  local payload="${3:-}"
  shift 3 || true
  local args=(-fsS -X "$method" "$BASE_URL$path")

  if [[ -n "$payload" ]]; then
    args+=(-H 'Content-Type: application/json' -d "$payload")
  fi

  for header in "$@"; do
    args+=(-H "$header")
  done

  curl "${args[@]}"
}

extract_token() {
  local body="$1"
  if printf '%s' "$body" | jq -e . >/dev/null 2>&1; then
    printf '%s' "$body" | jq -r 'if type == "object" and has("accessToken") then .accessToken elif type == "object" and has("token") then .token elif type == "string" then . else empty end'
  else
    printf '%s' "$body" | tr -d '"\r\n'
  fi
}

health=$(curl -fsS "$BASE_URL/health")
echo "$health" | jq '{status: .status, has_info: (.info != null)}'

commit=$(curl -fsS "$BASE_URL/commit")
echo "$commit" | jq '{commit: .commit, nodeEnv: .nodeEnv}'

register=$(request_json POST /auth/register "{\"email\":\"$EMAIL\",\"password\":\"$PASSWORD\",\"name\":\"$NAME\"}")
echo "$(extract_token "$register")"

login=$(request_json POST /auth/login "{\"email\":\"$EMAIL\",\"password\":\"$PASSWORD\"}")
JWT=$(extract_token "$login")
echo "$JWT"

me=$(curl -fsS "$BASE_URL/auth/me" -H "Authorization: Bearer $JWT")
echo "$me" | jq '{id, email, name}'

intelligence_create=$(curl -fsS -X POST "$BASE_URL/intelligence" -H 'Content-Type: application/json' -H "Authorization: Bearer $JWT" -d '{"name":"Smoke IO","content":"smoke test","objectType":"PATTERN"}')
echo "$intelligence_create" | jq '{id, name}'

curl -fsS "$BASE_URL/intelligence" -H "Authorization: Bearer $JWT" | jq 'length'
curl -fsS "$BASE_URL/providers" -H "Authorization: Bearer $JWT" | jq 'length'
curl -fsS "$BASE_URL/tools" -H "Authorization: Bearer $JWT" | jq 'length'

sovereignty=$(curl -fsS -X POST "$BASE_URL/sovereignty/evaluate" -H 'Content-Type: application/json' -H "Authorization: Bearer $JWT" -d '{"intent":"smoke test"}')
echo "$sovereignty" | jq '{recommendation, metricCount: .metricCount, metricNames: .metricNames}'

curl -fsS "$BASE_URL/evidence" -H "Authorization: Bearer $JWT" | jq 'length'

evidence_create=$(curl -fsS -X POST "$BASE_URL/evidence" -H 'Content-Type: application/json' -H "Authorization: Bearer $JWT" -d '{"intent":"smoke test","confidence":0.77}')
echo "$evidence_create" | jq '{id, intent}'

memory_create=$(curl -fsS -X POST "$BASE_URL/memory" -H 'Content-Type: application/json' -H "Authorization: Bearer $JWT" -d '{"title":"Smoke Memory","content":"smoke governed memory","category":"SMOKE","classification":"INSTITUTIONAL","accessScope":"WORKSPACE","retentionDays":30,"tags":["smoke","memory"]}')
memory_id=$(echo "$memory_create" | jq -r '.id')
echo "$memory_create" | jq '{id, title, classification, accessScope, lifecycleStatus, retentionDays}'

curl -fsS "$BASE_URL/memory?classification=INSTITUTIONAL" -H "Authorization: Bearer $JWT" | jq 'length'
curl -fsS -X DELETE "$BASE_URL/memory/$memory_id" -H "Authorization: Bearer $JWT" | jq '{success, id}'

echo "Smoke checks completed"
