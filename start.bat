@echo off
cd /d "%~dp0"
start "WebSocket" cmd /c "cd mini-services\pmmp-console-service && bun run dev"
timeout /t 2 >nul
bun run dev
