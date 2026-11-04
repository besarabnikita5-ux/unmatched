#!/usr/bin/env bash
# macOS / Linux. Параметри передаються далі, напр.:  ./start-bridge.sh --lan
cd "$(dirname "$0")"
SITE="https://ВАШ-ЛОГІН.github.io"   # адреса сайту на GitHub Pages (без / в кінці)
command -v node >/dev/null || { echo "Встановіть Node.js з https://nodejs.org"; exit 1; }
[ -d node_modules ] || npm install --no-audit --no-fund
exec node server.js --allow "$SITE" "$@"
