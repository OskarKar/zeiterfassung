#!/bin/sh
# ============================================================
# Zeiterfassung – Einmaliges NAS-Setup (Task 1)
# Nur EINMALIG ausführen um Git zu initialisieren.
# Danach immer nur update.sh verwenden!
# ============================================================

REPO="https://github.com/OskarKar/zeiterfassung.git"
DIR="/volume1/docker/zeiterfassung-docker"
LOG="$DIR/init.log"

mkdir -p "$DIR"
mkdir -p "$DIR/data"

echo "" >> "$LOG"
echo "=========================================" >> "$LOG"
echo "Init gestartet: $(date '+%Y-%m-%d %H:%M:%S')" >> "$LOG"
echo "=========================================" >> "$LOG"

log() {
  echo "$1"
  echo "$1" >> "$LOG"
}

cd "$DIR" || { log "FEHLER: cd $DIR fehlgeschlagen"; exit 1; }

log "[1/4] Initialisiere Git-Repository..."
git init >> "$LOG" 2>&1

log "[2/4] Verbinde mit GitHub..."
git remote remove origin >> "$LOG" 2>&1 || true
git remote add origin "$REPO" >> "$LOG" 2>&1

log "[3/4] Lade aktuellsten Code von GitHub (main)..."
git fetch origin >> "$LOG" 2>&1 || { log "FEHLER: git fetch fehlgeschlagen - Internetverbindung prüfen"; exit 1; }
git reset --hard origin/main >> "$LOG" 2>&1

log "[4/4] Baue Docker-Container und starte..."
docker compose up -d --build >> "$LOG" 2>&1 || { log "FEHLER: docker compose fehlgeschlagen"; exit 1; }

log ""
log "SUCCESS Init abgeschlossen: $(date '+%Y-%m-%d %H:%M:%S')"
log "App läuft auf Port 3000."
log "Log: $LOG"
