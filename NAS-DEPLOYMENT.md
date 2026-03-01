# NAS Deployment Anleitung für v1.3 Test-Environment

## Übersicht

Diese Version läuft parallel zur Produktionsversion auf **Port 3001**.

- **Produktion**: `http://192.168.1.8:3000` (zeiterfassung-docker)
- **Test v1.3**: `http://192.168.1.8:3001` (zeiterfassung-docker-v1.3)

## Erstmalige Installation auf NAS

### 1. Ordner auf NAS erstellen

```bash
mkdir -p /volume1/docker/zeiterfassung-docker-v1.3
cd /volume1/docker/zeiterfassung-docker-v1.3
```

### 2. Dateien hochladen

Lade alle Dateien aus `zeiterfassung-docker-v1.3` auf das NAS in den Ordner `/volume1/docker/zeiterfassung-docker-v1.3`

### 3. GitHub Token speichern

```bash
echo 'YOUR_GITHUB_PAT_HERE' > /volume1/docker/zeiterfassung-docker-v1.3/data/.github_token
```

**Hinweis**: Ersetze `YOUR_GITHUB_PAT_HERE` mit deinem echten GitHub Personal Access Token.

### 4. Produktions-Datenbank kopieren (optional)

Für realistische Tests mit echten Daten:

```bash
cp /volume1/docker/zeiterfassung-docker/data/zeiterfassung.db /volume1/docker/zeiterfassung-docker-v1.3/data/
```

### 5. Container starten

```bash
cd /volume1/docker/zeiterfassung-docker-v1.3
docker compose up -d
```

### 6. Testen

Öffne im Browser: `http://192.168.1.8:3001`

## Update-Prozess

### Manuelles Update

```bash
cd /volume1/docker/zeiterfassung-docker-v1.3
sh update.sh
```

### Über Aufgabenplaner

1. **Aufgabenplaner** öffnen
2. **Erstellen** → **Geplante Aufgabe** → **Benutzerdefiniertes Script**
3. **Name**: `Zeiterfassung v1.3 Update`
4. **Benutzer**: `root`
5. **Script**:
```bash
cd /volume1/docker/zeiterfassung-docker-v1.3
sh update.sh
```

## Wichtige Unterschiede zu Produktion

| Eigenschaft | Produktion | Test v1.3 |
|-------------|-----------|-----------|
| Port | 3000 | 3001 |
| Container Name | zeiterfassung | zeiterfassung-v13 |
| Ordner | zeiterfassung-docker | zeiterfassung-docker-v1.3 |
| GitHub Branch | main | v1.3-dev |
| Datenbank | Produktionsdaten | Kopie/Testdaten |

## Neue Features in v1.3

- ✅ Mitarbeiter haben eigene Kalender-URL
- ✅ Tour/Kalender-Auswahl bei Zeiterfassung
- ✅ Inline-Ticket-Erstellung während Zeiterfassung
- ✅ KEHRBUCH-Parsing (U201-016 → Reihenfolge 16)
- ✅ Validierung: Kein Speichern ohne Ticket-Bestätigung

## Troubleshooting

### Container läuft nicht
```bash
docker logs zeiterfassung-v13
```

### Port bereits belegt
Prüfe ob Port 3001 frei ist:
```bash
netstat -tulpn | grep 3001
```

### Datenbank-Probleme
Lösche die Datenbank und starte neu:
```bash
rm /volume1/docker/zeiterfassung-docker-v1.3/data/zeiterfassung.db
docker compose restart
```

## Zurück zur Produktion

Wenn v1.3 getestet ist und gut funktioniert:

1. Stoppe v1.3: `docker compose down`
2. Merge v1.3-dev → main
3. Update Produktion mit neuem Code
4. Lösche v1.3 Test-Environment (optional)
