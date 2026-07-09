#!/usr/bin/env bash
# Runs app/server.py from a throwaway copy of app/ + public/, so E2E test
# runs never read or write this repo's real data/ directory (server.py
# resolves its data dir relative to its own file location, not cwd —
# see app/server.py's DATA_DIR = ROOT_DIR / 'data'). Without this, running
# `npm test` locally would overwrite a developer's real local admin
# account, sessions, and settings.
set -euo pipefail

PORT="${1:-8934}"
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
E2E_ROOT="$(mktemp -d "${TMPDIR:-/tmp}/cpu-e2e.XXXXXX")"

cp -R "$REPO_ROOT/app" "$E2E_ROOT/app"
cp -R "$REPO_ROOT/public" "$E2E_ROOT/public"

echo "[isolated-server] serving isolated copy from: $E2E_ROOT (port $PORT)"

# Not `exec`'d: this script stays alive as the parent so its EXIT/INT/TERM
# trap can kill the python child and remove the temp dir. `exec` would
# replace this process image, and the trap would never run.
python3 "$E2E_ROOT/app/server.py" --port "$PORT" &
SERVER_PID=$!

cleanup() {
  kill "$SERVER_PID" 2>/dev/null || true
  wait "$SERVER_PID" 2>/dev/null || true
  rm -rf "$E2E_ROOT"
}
trap cleanup EXIT INT TERM

wait "$SERVER_PID"
