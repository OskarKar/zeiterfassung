#!/bin/sh
# ============================================================
# Zeiterfassung – Update-Skript (NAS / Linux)
# Zieht den neuesten Code und baut den Docker-Container neu.
# Die Datenbank in ./data bleibt UNBERÜHRT.
# ============================================================

LOG_FILE="./data/update.log"
mkdir -p ./data

log() {
  echo "$1"
  printf '%s\n' "$1" >> "$LOG_FILE"
}

printf '\n' >> "$LOG_FILE"
log "========================================="
log "Update gestartet: $(date '+%Y-%m-%d %H:%M:%S')"
log "========================================="

set -e

log "[1/3] Code aktualisieren (git pull)..."
git pull >> "$LOG_FILE" 2>&1

log "[2/3] Docker-Image neu bauen..."
docker compose build --no-cache >> "$LOG_FILE" 2>&1

log "[3/3] Container neustarten..."
docker compose up -d >> "$LOG_FILE" 2>&1

VERSION=$(grep '"version"' server/package.json | head -1 | sed 's/.*"\([0-9.]*\)".*/\1/')
log ""
log "SUCCESS Update abgeschlossen: $(date '+%Y-%m-%d %H:%M:%S')"
log "Version: v${VERSION}"
log "Datenbank (./data) wurde nicht veraendert."
