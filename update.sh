#!/bin/sh
# ============================================================
# Zeiterfassung – Update-Skript (NAS / Linux)
# Zieht den neuesten Code und baut den Docker-Container neu.
# Die Datenbank in ./data bleibt UNBERÜHRT.
# ============================================================

REPO="https://github.com/OskarKar/zeiterfassung.git"
DIR="/volume1/docker/zeiterfassung-docker"

mkdir -p "$DIR/data"
LOG_FILE="$DIR/data/update.log"

log() {
  echo "$1"
  printf '%s\n' "$1" >> "$LOG_FILE"
}

printf '\n' >> "$LOG_FILE"
log "========================================="
log "Update gestartet: $(date '+%Y-%m-%d %H:%M:%S')"
log "========================================="

cd "$DIR" || { log "FEHLER: Verzeichnis $DIR nicht gefunden"; exit 1; }

# If no .git folder (e.g. after manual file copy), initialize git first
if [ ! -d ".git" ]; then
  log "[0/3] Kein Git-Repository gefunden - initialisiere..."
  git init >> "$LOG_FILE" 2>&1
  git remote add origin "$REPO" >> "$LOG_FILE" 2>&1
  git fetch origin >> "$LOG_FILE" 2>&1 || { log "FEHLER: git fetch fehlgeschlagen - Internetverbindung pruefen"; exit 1; }
  git reset --hard origin/main >> "$LOG_FILE" 2>&1
  log "[0/3] Git initialisiert."
fi

log "[1/3] Code aktualisieren..."
git fetch origin >> "$LOG_FILE" 2>&1 || { log "FEHLER: git fetch fehlgeschlagen - Internetverbindung pruefen"; exit 1; }
git reset --hard origin/main >> "$LOG_FILE" 2>&1

log "[2/3] Docker-Image neu bauen..."
docker compose build --no-cache >> "$LOG_FILE" 2>&1 || { log "FEHLER: docker compose build fehlgeschlagen"; exit 1; }

log "[3/3] Container neustarten..."
docker compose up -d >> "$LOG_FILE" 2>&1 || { log "FEHLER: docker compose up fehlgeschlagen"; exit 1; }

VERSION=$(grep '"version"' server/package.json | head -1 | sed 's/.*"\([0-9.]*\)".*/\1/')
log ""
log "SUCCESS Update abgeschlossen: $(date '+%Y-%m-%d %H:%M:%S')"
log "Version: v${VERSION}"
log "Datenbank (./data) wurde nicht veraendert."
