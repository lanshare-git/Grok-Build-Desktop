#!/bin/bash
# electron-builder deb afterInstall
# 1) 修正 chrome-sandbox SUID（否则 Linux 上会 FATAL 退出）
# 2) 保证 /usr/bin/grok-build-desktop 可直接启动
set -e
PREFIX="/opt/GrokBuildDesktop"
SANDBOX="$PREFIX/chrome-sandbox"
BIN="$PREFIX/grok-build-desktop"

if [ -f "$SANDBOX" ]; then
  chown root:root "$SANDBOX"
  chmod 4755 "$SANDBOX"
fi

if [ -x "$BIN" ]; then
  ln -sfn "$BIN" /usr/bin/grok-build-desktop
fi
