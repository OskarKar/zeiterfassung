# Zeiterfassung – Docker App

Lokale Zeiterfassungs-App für Synology NAS. Läuft vollständig im lokalen Netzwerk.

## Tech Stack

- **Backend:** Node.js + Express
- **Datenbank:** SQLite (Node.js built-in) mit WAL-Modus
- **Frontend:** Vanilla JS + Tailwind CSS (statisch, kein Build-Schritt)
- **Echtzeit:** Socket.io
- **Deployment:** Docker / docker-compose

---

## Projektstruktur

```
zeiterfassung-docker/
├── server/
│   ├── index.js          # Express + Socket.io Server
│   ├── db.js             # SQLite Schema & Queries
│   ├── routes/
│   │   ├── employees.js  # Mitarbeiterverwaltung API
│   │   ├── import.js     # Excel-Import API
│   │   ├── export.js     # PDF-Export API
│   │   └── stats.js      # Statistik API
│   └── package.json
├── client/
│   ├── index.html        # HTML-Shell
│   └── app.js            # Frontend-Logik
├── data/                 # SQLite-Datei (persistentes Volume – nie in Git!)
├── Dockerfile
├── docker-compose.yml
├── nas-init.sh           # Einmaliges NAS-Setup (Git-Init + erster Build)
├── update.sh             # Update-Skript für NAS (git pull + rebuild)
├── update.bat            # Update-Skript für Windows lokal
└── README.md
```

---

## Schnellstart (Synology NAS)

### 1. Einmaliges Setup via Task Scheduler

Im DSM: **Systemsteuerung → Aufgabenplaner → Erstellen → Benutzerdefiniertes Skript**

- Name: `Zeiterfassung Init`
- Benutzer: `root`
- Zeitplan: Manuell
- Skript:
```bash
cd /volume1/docker/zeiterfassung-docker
git init
git remote remove origin 2>/dev/null || true
git remote add origin https://github.com/OskarKar/zeiterfassung.git
git fetch origin
git reset --hard origin/main
docker compose up -d --build
```

Task einmalig **Ausführen** → App läuft auf Port 3000.

### 2. App aufrufen

```
http://<NAS-IP>:3000
```

---

## Updates einspielen

### Schritt 1 — Auf Windows (nach Änderungen)
```bash
git add .
git commit -m "v1.x.x: Beschreibung"
git push
```

### Schritt 2 — Auf dem NAS (Task Scheduler)

Im DSM: **Aufgabenplaner → Task "Zeiterfassung Update" → Ausführen**

Task einmalig anlegen (dann immer wiederverwendbar):
- Name: `Zeiterfassung Update`
- Benutzer: `root`
- Zeitplan: Manuell
- Skript:
```bash
cd /volume1/docker/zeiterfassung-docker
git pull
docker compose build --no-cache
docker compose up -d
```

> Die Datenbank in `./data` bleibt bei jedem Update **vollständig erhalten**.

---

## Lokal testen (Windows / Linux)

```bash
cd zeiterfassung-docker/server
npm install
cd ..
node server/index.js
```

Dann: `http://localhost:3000`

---

## Erster Start

1. **Als Admin anmelden** – Standard-PIN: `1234`
2. Tab **Mitarbeiter** → Mitarbeiter anlegen
3. Abmelden, als Mitarbeiter anmelden
4. Zeiten erfassen

---

## Features

| Feature | Beschreibung |
|---|---|
| **Mitarbeiter-Login** | Einfache Namensliste, kein Passwort |
| **Admin-Login** | PIN-geschützt (konfigurierbar) |
| **Zeiterfassung** | Datum, Start, Ende, Kategorie, Beschreibung |
| **Kategorien** | Kehrtour, Büro, Krankenstand, Urlaub, Betriebsurlaub, Fortbildung, Feiertag |
| **Außendienst** | Checkbox pro Eintrag |
| **Trinkgeld** | Betrag pro Tag erfassbar |
| **Rückwirkende Erfassung** | Beliebiges Datum wählbar |
| **Echtzeit-Präsenz** | Chef-Dashboard zeigt sofort, wer gerade Zeiten eingibt |
| **PDF Export** | Monatsbericht im Lohnverrechnungs-Format |
| **Integritäts-Schutz** | HMAC-SHA256 Hash pro Eintrag – Manipulationen erkennbar |
| **SQLite WAL** | Sicher für gleichzeitige Zugriffe im Netzwerk |

---

## Einstellungen

Im Admin-Bereich (Tab „Einstellungen") konfigurierbar:

| Einstellung | Standard |
|---|---|
| Admin-PIN | `1234` |
| Taggeld-Satz (€/Std.) | `1.27` |
| Pausengrenze (Stunden) | `6` |
| Pausendauer (Minuten) | `30` |

---

## Datenbank-Backup

Die SQLite-Datei liegt unter `./data/database.sqlite`.  
Einfach diese Datei kopieren = vollständiges Backup.

```bash
# Backup erstellen
cp /volume1/docker/zeiterfassung/data/database.sqlite \
   /volume1/backup/zeiterfassung_$(date +%Y%m%d).sqlite
```

---

## Port ändern

In `docker-compose.yml`:
```yaml
ports:
  - "8080:3000"  # App dann auf Port 8080 erreichbar
```

---

## Echtzeit-Präsenz (Socket.io)

Wenn ein Mitarbeiter das Erfassungsformular ausfüllt:
- Alle verbundenen Chef-Dashboards zeigen sofort ein Banner:
  **„⚠️ Achtung: [Name] gibt gerade Zeiten ein."**
- Das Banner verschwindet automatisch nach 3 Sekunden Inaktivität.
