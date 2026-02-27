@echo off
REM ============================================================
REM Zeiterfassung – Lokales Update-Skript (Windows)
REM Nur für lokales Testen – kein Docker nötig.
REM ============================================================

echo =^> [1/2] Neuesten Code holen...
git pull

echo =^> [2/2] npm-Abhängigkeiten aktualisieren...
cd server
npm install
cd ..

echo.
echo Update abgeschlossen.
echo Server starten: start.bat
pause
