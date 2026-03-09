#!/bin/sh
# ============================================================
# Zeiterfassung ? Datenbank Backup-Skript
# Erstellt ein Backup der Datenbank vor Updates
# ============================================================

DIR="/volume1/docker/zeiterfassung-docker-v1.3"
DB_FILE="$DIR/data/zeiterfassung.db"
BACKUP_DIR="$DIR/data/backups"
TIMESTAMP=$(date '+%Y%m%d_%H%M%S')
BACKUP_FILE="$BACKUP_DIR/zeiterfassung_backup_$TIMESTAMP.db"

# Backup-Verzeichnis erstellen
mkdir -p "$BACKUP_DIR"

# Pr?fen ob Datenbank existiert
if [ ! -f "$DB_FILE" ]; then
  echo "WARNUNG: Keine Datenbank gefunden unter $DB_FILE"
  echo "Kein Backup n?tig."
  exit 0
fi

# Backup erstellen
echo "Erstelle Datenbank-Backup..."
cp "$DB_FILE" "$BACKUP_FILE"

if [ $? -eq 0 ]; then
  echo "? Backup erfolgreich erstellt: $BACKUP_FILE"
  
  # Alte Backups l?schen (?lter als 30 Tage)
  find "$BACKUP_DIR" -name "zeiterfassung_backup_*.db" -mtime +30 -delete
  
  # Anzahl Backups anzeigen
  BACKUP_COUNT=$(ls -1 "$BACKUP_DIR"/zeiterfassung_backup_*.db 2>/dev/null | wc -l)
  echo "?? Gesamt Backups: $BACKUP_COUNT"
else
  echo "? FEHLER: Backup fehlgeschlagen!"
  exit 1
fi