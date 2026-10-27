#!/bin/sh
# Twice-daily refresh for the claude.ai version: collect events from the sources,
# then rebuild artifact/ce-facem-timisoara.html (publishing is done by Claude).
set -e
cd "$(dirname "$0")/.."
export PATH="$(pwd)/.tools/node/bin:$PATH"
export DEMO_DATA=off
LOG=".data/refresh.log"
mkdir -p .data
{
  echo "=== $(date '+%Y-%m-%d %H:%M:%S') refresh"
  npx tsx scripts/ingest.ts --manual
  npx tsx scripts/build-artifact.ts
} 2>&1 | tee -a "$LOG"
