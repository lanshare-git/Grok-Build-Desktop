@echo off
chcp 65001 >nul
cd /d "%~dp0.."

REM Clear inherited env vars that break Electron on this machine
set ELECTRON_RUN_AS_NODE=
set CODEBUDDY_SAFE_DELETE_ENABLED=0

if not exist "out\main\index.js" (
  echo.
  echo   [X] Build output not found: out\main\index.js
  echo       Run:  npm run build
  echo.
  pause
  exit /b 1
)

echo.
echo   Grok Build Desktop - RUN BUILT OUTPUT
echo   ------------------------------------
echo   Launching electron . ...
echo.

start "" "node_modules\electron\dist\electron.exe" .
