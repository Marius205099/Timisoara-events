#!/bin/sh
# Twice-daily refresh for the claude.ai version: collect events from the sources,
# then rebuild artifact/ce-facem-timisoara.html (publishing is done by Claude).
# The run works on a copy of the database and only replaces it when collection AND build
# succeed, so an interrupted run (Mac asleep, app closed) cannot damage it.
set -e
cd "$(dirname "$0")/.."
export PATH="$(pwd)/.tools/node/bin:$PATH"
export DEMO_DATA=off
LOG=".data/refresh.log"
WORK=".data/pglite.work"
mkdir -p .data
rm -rf "$WORK"
if [ -d .data/pglite ]; then cp -R .data/pglite "$WORK"; fi
echo "=== $(date '+%Y-%m-%d %H:%M:%S') refresh" >> "$LOG"
if PGLITE_DIR="$WORK" npx tsx scripts/ingest.ts --manual >> "$LOG" 2>&1 &&
  PGLITE_DIR="$WORK" npx tsx scripts/build-artifact.ts >> "$LOG" 2>&1; then
  rm -rf .data/pglite.prev
  if [ -d .data/pglite ]; then mv .data/pglite .data/pglite.prev; fi
  mv "$WORK" .data/pglite
  tail -1 "$LOG"
else
  rm -rf "$WORK"
  echo "refresh failed: database left unchanged, see $LOG" | tee -a "$LOG"
  exit 1
fi
