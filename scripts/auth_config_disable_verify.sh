#!/usr/bin/env bash
# One-shot: disable email verification on the demo InsForge project.
# Idempotent.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
[ -f "$ROOT/.env" ] && set -a && source "$ROOT/.env" && set +a

URL="${INSFORGE_PROJECT_URL:?INSFORGE_PROJECT_URL missing}"
KEY="${INSFORGE_ACCESS_API_KEY:?INSFORGE_ACCESS_API_KEY missing}"

curl -fsS -X PUT \
  -H "x-api-key: $KEY" \
  -H "Content-Type: application/json" \
  -d '{"requireEmailVerification":false}' \
  "$URL/api/auth/config" | python3 -m json.tool

echo "OK: email verification disabled."
