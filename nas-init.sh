#!/bin/sh
# ============================================================
# Zeiterfassung – Einmaliges NAS-Setup (Task 1)
# Nur EINMALIG ausführen um Git zu initialisieren.
# Danach immer nur update.sh verwenden!
# ============================================================
set -e

REPO="https://github.com/OskarKar/zeiterfassung.git"
DIR="/volume1/docker/zeiterfassung-docker"

echo "==> Wechsle in Projektordner: $DIR"
cd "$DIR"

echo "==> Initialisiere Git-Repository..."
git init

echo "==> Verbinde mit GitHub..."
git remote remove origin 2>/dev/null || true
git remote add origin "$REPO"

echo "==> Lade aktuellsten Code von GitHub..."
git fetch origin
git reset --hard origin/main

echo "==> Baue Docker-Container und starte..."
docker compose up -d --build

echo ""
echo "✅ Init abgeschlossen! App läuft auf Port 3000."
echo "   Für künftige Updates: update.sh ausführen."
