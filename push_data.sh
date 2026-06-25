#!/usr/bin/env bash
# Fetch ESO snapshot and push to data branch.
# Run every 5 min via cron.

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
DATA_WORKTREE="$(cd "$SCRIPT_DIR/../eso-data" && pwd)"

# ── Prices: always run first, independent of ESO availability ────────────────
set +e
DATA_DIR="$DATA_WORKTREE/data" python3 "$SCRIPT_DIR/fetch.py" --prices-only || true

# ── Fetch (strict: exit if ESO is unreachable — nothing to commit) ────────────
set -euo pipefail
DATA_DIR="$DATA_WORKTREE/data" python3 "$SCRIPT_DIR/fetch.py"

# ── Secondary scripts — errors must not block the push ────────────────────────
set +e
DATA_DIR="$DATA_WORKTREE/data" python3 "$SCRIPT_DIR/compute_records.py" || true
DATA_DIR="$DATA_WORKTREE/data" python3 "$SCRIPT_DIR/update_records_history_jsonl.py" || true

# ── Load profile — once per day ───────────────────────────────────────────────
TODAY=$(date -u +%Y-%m-%d)
PROFILE="$DATA_WORKTREE/data/load_profile.json"
if ! grep -q "\"computed\": \"$TODAY\"" "$PROFILE" 2>/dev/null; then
    DATA_DIR="$DATA_WORKTREE/data" python3 "$SCRIPT_DIR/compute_load_profile.py" || true
fi

# ── Git: best-effort — data is always committed locally; push when GH reachable
cd "$DATA_WORKTREE"
git rebase --abort 2>/dev/null   # recover from any stuck rebase
git add data/
git diff --cached --quiet && exit 0   # nothing new

git commit -m "data: $(date -u +%Y-%m-%dT%H:%M:%SZ)"
git pull --rebase origin data 2>/dev/null || true
git push origin data 2>/dev/null || true
