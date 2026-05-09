#!/usr/bin/env bash
# Initialize NIA_HACK artifact directory tree on external volume.
# Run after K drive is mounted. Idempotent.
set -euo pipefail

# Load .env
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
if [ -f "$ROOT_DIR/.env" ]; then
  # shellcheck disable=SC1091
  set -a; source "$ROOT_DIR/.env"; set +a
fi

ARTIFACTS_ROOT="${ARTIFACTS_ROOT:-/Volumes/K/NIA_HACK}"

# Verify mount point parent exists
mount_root="$(dirname "$ARTIFACTS_ROOT")"
if [ ! -d "$mount_root" ]; then
  echo "ERROR: $mount_root does not exist. Plug in K drive (or update ARTIFACTS_ROOT in .env)." >&2
  exit 1
fi

# Confirm parent is a real mount, not just a folder on root disk
parent_dev=$(stat -f '%Sd' "$mount_root" 2>/dev/null || true)
root_dev=$(stat -f '%Sd' "/")
if [ "$mount_root" = "/Volumes/K" ] && [ "$parent_dev" = "$root_dev" ]; then
  echo "ERROR: $mount_root resolves to root disk — not a real external mount." >&2
  exit 1
fi

# Create tree
mkdir -p \
  "$ARTIFACTS_ROOT/repos" \
  "$ARTIFACTS_ROOT/sandboxes" \
  "$ARTIFACTS_ROOT/cache/docker" \
  "$ARTIFACTS_ROOT/cache/pip" \
  "$ARTIFACTS_ROOT/cache/npm" \
  "$ARTIFACTS_ROOT/cache/huggingface" \
  "$ARTIFACTS_ROOT/cache/playwright" \
  "$ARTIFACTS_ROOT/builds/next" \
  "$ARTIFACTS_ROOT/recordings" \
  "$ARTIFACTS_ROOT/screenshots" \
  "$ARTIFACTS_ROOT/snapshots" \
  "$ARTIFACTS_ROOT/logs" \
  "$ARTIFACTS_ROOT/tmp"

echo "Artifact tree ready at: $ARTIFACTS_ROOT"
df -h "$ARTIFACTS_ROOT"
echo
echo "Symlinking heavy local caches to external volume..."

# Symlink Next.js build outputs (saves ~500MB-1GB)
if [ -d "$ROOT_DIR/web" ] && [ ! -L "$ROOT_DIR/web/.next" ]; then
  rm -rf "$ROOT_DIR/web/.next" 2>/dev/null || true
  ln -s "$ARTIFACTS_ROOT/builds/next" "$ROOT_DIR/web/.next"
  echo "  web/.next -> $ARTIFACTS_ROOT/builds/next"
fi

# Pip cache
ln -snf "$ARTIFACTS_ROOT/cache/pip" "$HOME/.cache/pip-niahack" 2>/dev/null || true
echo "  ~/.cache/pip-niahack -> $ARTIFACTS_ROOT/cache/pip"

# Hugging Face cache (in case any model pulls happen)
ln -snf "$ARTIFACTS_ROOT/cache/huggingface" "$HOME/.cache/huggingface-niahack" 2>/dev/null || true

echo
echo "Recommended exports for shell sessions:"
cat <<EOF
  export ARTIFACTS_ROOT="$ARTIFACTS_ROOT"
  export PIP_CACHE_DIR="\$ARTIFACTS_ROOT/cache/pip"
  export NPM_CONFIG_CACHE="\$ARTIFACTS_ROOT/cache/npm"
  export HF_HOME="\$ARTIFACTS_ROOT/cache/huggingface"
  export PLAYWRIGHT_BROWSERS_PATH="\$ARTIFACTS_ROOT/cache/playwright"
  export DOCKER_TMPDIR="\$ARTIFACTS_ROOT/tmp"
  export TMPDIR="\$ARTIFACTS_ROOT/tmp"
EOF
echo
echo "OK"
