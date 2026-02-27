@echo off
title Zeiterfassung Server

:: Alten Prozess auf Port 3000 beenden (falls noch einer läuft)
for /f "tokens=5" %%a in ('netstat -ano ^| findstr :3000 ^| findstr LISTENING') do (
    taskkill /F /PID %%a >nul 2>&1
)

cd /d %~dp0server
echo Starte Zeiterfassung...
echo App laeuft auf: http://localhost:3000
echo.
echo Fenster NICHT schliessen - Server laeuft im Hintergrund.
echo Zum Beenden: Dieses Fenster schliessen.
echo.
node --experimental-sqlite index.js
pause
