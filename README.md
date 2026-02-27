# Zeiterfassung – Docker App

Lokale Zeiterfassungs-App für Synology NAS. Läuft vollständig im lokalen Netzwerk.

## Tech Stack

- **Backend:** Node.js + Express
- **Datenbank:** SQLite (`better-sqlite3`) mit WAL-Modus
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
│   └── package.json
├── client/
│   ├── index.html        # HTML-Shell
│   └── app.js            # Frontend-Logik
├── data/                 # SQLite-Datei (persistentes Volume)
├── Dockerfile
├── docker-compose.yml
└── README.md
```

---

## Schnellstart (Synology NAS)

### 1. Dateien auf die NAS kopieren

Kopiere den gesamten Ordner `zeiterfassung-docker/` auf deine Synology NAS, z. B. nach:
```
/volume1/docker/zeiterfassung/
```

### 2. Per SSH oder Container Manager starten

**Per SSH:**
```bash
cd /volume1/docker/zeiterfassung
docker-compose up -d
```

**Per Synology Container Manager:**
1. Öffne Container Manager → Projekt → Erstellen
2. Wähle den Ordner mit der `docker-compose.yml`
3. Starte das Projekt

### 3. App aufrufen

Im Browser im lokalen Netzwerk:
```
http://<NAS-IP>:3000
```

z. B. `http://192.168.1.100:3000`

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
