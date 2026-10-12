@echo off
chcp 65001 >nul
cd /d "%~dp0.."

REM Clear inherited env vars that break Electron on this machine
set ELECTRON_RUN_AS_NODE=
set CODEBUDDY_SAFE_DELETE_ENABLED=0

echo.
echo   Grok Build Desktop - DEV MODE
echo   ------------------------------------
echo   Working dir: %CD%
echo   Starting electron-vite dev (hot reload)...
echo.

call npm run dev

echo.
echo   [dev server exited]
pause
