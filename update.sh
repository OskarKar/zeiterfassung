#!/bin/sh
# ============================================================
# Zeiterfassung – Update-Skript (NAS / Linux)
# Lädt den neuesten Code von GitHub und baut den Container neu.
# Die Datenbank in ./data bleibt UNBERÜHRT.
# ============================================================

DIR="/volume1/docker/zeiterfassung-docker"
TOKEN_FILE="$DIR/data/.github_token"

if [ ! -f "$TOKEN_FILE" ]; then
  echo "FEHLER: Token-Datei nicht gefunden: $TOKEN_FILE"
  echo "Bitte Token speichern: echo 'github_pat_...' > $TOKEN_FILE"
  exit 1
fi

TOKEN=$(cat "$TOKEN_FILE")
BASE="https://$TOKEN@raw.githubusercontent.com/OskarKar/zeiterfassung/main"
LOG_FILE="$DIR/data/update.log"

mkdir -p "$DIR/data" "$DIR/client" "$DIR/server" "$DIR/server/routes"

log() {
  echo "$1"
  printf '%s\n' "$1" >> "$LOG_FILE"
}

printf '\n' >> "$LOG_FILE"
log "========================================="
log "Update gestartet: $(date '+%Y-%m-%d %H:%M:%S')"
log "========================================="

log "[1/3] Dateien von GitHub herunterladen..."
wget -q -O "$DIR/client/app.js"                  "$BASE/client/app.js"                  || { log "FEHLER: app.js"; exit 1; }
wget -q -O "$DIR/server/index.js"                "$BASE/server/index.js"                || { log "FEHLER: index.js"; exit 1; }
wget -q -O "$DIR/server/db.js"                   "$BASE/server/db.js"                   || { log "FEHLER: db.js"; exit 1; }
wget -q -O "$DIR/server/package.json"            "$BASE/server/package.json"            || { log "FEHLER: package.json"; exit 1; }
wget -q -O "$DIR/server/routes/export.js"        "$BASE/server/routes/export.js"        || { log "FEHLER: export.js"; exit 1; }
wget -q -O "$DIR/server/routes/employees.js"     "$BASE/server/routes/employees.js"     || { log "FEHLER: employees.js"; exit 1; }
wget -q -O "$DIR/server/routes/import.js"        "$BASE/server/routes/import.js"        || { log "FEHLER: import.js"; exit 1; }
wget -q -O "$DIR/server/routes/tickets.js"       "$BASE/server/routes/tickets.js"       || { log "FEHLER: tickets.js"; exit 1; }
wget -q -O "$DIR/server/routes/customers.js"     "$BASE/server/routes/customers.js"     || { log "FEHLER: customers.js"; exit 1; }
wget -q -O "$DIR/server/routes/calendar.js"      "$BASE/server/routes/calendar.js"      || { log "FEHLER: calendar.js"; exit 1; }
wget -q -O "$DIR/server/routes/tours.js"         "$BASE/server/routes/tours.js"         || { log "FEHLER: tours.js"; exit 1; }
wget -q -O "$DIR/server/routes/stats.js"         "$BASE/server/routes/stats.js"         || { log "FEHLER: stats.js"; exit 1; }
wget -q -O "$DIR/Dockerfile"                     "$BASE/Dockerfile"                     || { log "FEHLER: Dockerfile"; exit 1; }
wget -q -O "$DIR/docker-compose.yml"             "$BASE/docker-compose.yml"             || { log "FEHLER: docker-compose.yml"; exit 1; }
wget -q -O "$DIR/update.sh"                      "$BASE/update.sh"                      || { log "FEHLER: update.sh"; exit 1; }
log "[1/3] Download abgeschlossen."

cd "$DIR" || { log "FEHLER: cd $DIR fehlgeschlagen"; exit 1; }

log "[2/3] Docker-Image neu bauen..."
docker compose -f "$DIR/docker-compose.yml" down >> "$LOG_FILE" 2>&1
docker compose -f "$DIR/docker-compose.yml" build --no-cache >> "$LOG_FILE" 2>&1 || { log "FEHLER: docker compose build fehlgeschlagen"; exit 1; }

log "[3/3] Container neustarten..."
docker compose -f "$DIR/docker-compose.yml" up -d >> "$LOG_FILE" 2>&1 || { log "FEHLER: docker compose up fehlgeschlagen"; exit 1; }

VERSION=$(grep '"version"' "$DIR/server/package.json" | head -1 | sed 's/.*"\([0-9.]*\)".*/\1/')
log ""
log "SUCCESS Update abgeschlossen: $(date '+%Y-%m-%d %H:%M:%S')"
log "Version: v${VERSION}"
log "Datenbank ./data wurde nicht veraendert."
