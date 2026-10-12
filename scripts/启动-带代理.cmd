@echo off
chcp 65001 >nul
cd /d "%~dp0.."

REM ---- 环境修正 ----
REM 清除沙箱/工具注入的变量，否则 Electron 会退化成 Node 模式
set ELECTRON_RUN_AS_NODE=
set CODEBUDDY_SAFE_DELETE_ENABLED=0

REM ---- 代理（关键）----
REM grok 只认这两个环境变量，不读 Windows 系统代理设置。
REM 子进程会继承这里设置的值，因此本脚本无论应用内是否配置过代理都有效。
set HTTP_PROXY=socks5h://127.0.0.1:10808
set HTTPS_PROXY=socks5h://127.0.0.1:10808
set ALL_PROXY=socks5h://127.0.0.1:10808
set http_proxy=socks5h://127.0.0.1:10808
set https_proxy=socks5h://127.0.0.1:10808

if not exist "app\Grok Build Desktop.exe" (
  echo.
  echo   [X] 未找到 app\Grok Build Desktop.exe
  echo       请先运行: npm run build ^&^& npx electron-builder
  echo       然后将 dist-v3\win-unpacked 同步到 app\
  echo.
  pause
  exit /b 1
)

echo.
echo   Grok Build Desktop - 带代理启动
echo   ------------------------------------
echo   代理: %HTTPS_PROXY%
echo.
start "" "app\Grok Build Desktop.exe"
