#!/bin/sh
# ============================================================
# Zeiterfassung – Update-Skript (NAS / Linux)
# Zieht den neuesten Code und baut den Docker-Container neu.
# Die Datenbank in ./data bleibt UNBERÜHRT.
# ============================================================
set -e

echo "==> [1/3] Neuesten Code holen..."
git pull

echo "==> [2/3] Docker-Image neu bauen..."
docker compose build --no-cache

echo "==> [3/3] Container neustarten..."
docker compose up -d

echo ""
echo "✅ Update abgeschlossen. App läuft auf Port 3000."
echo "   Datenbank (./data) wurde nicht verändert."
