#!/usr/bin/env bash
# Compila Excalidraw y sube la web a draw.awordz.com (VPS hermes-vps).
# Uso: bash deploy.sh
set -euo pipefail
cd "$(dirname "$0")"
npx --yes yarn@1 install --frozen-lockfile
npx --yes yarn@1 build:app:docker
tar -C excalidraw-app/build -czf - . | ssh hermes-vps 'rm -rf /opt/draw/html.new && mkdir -p /opt/draw/html.new && tar -C /opt/draw/html.new -xzf - && rm -rf /opt/draw/html.old && mv /opt/draw/html /opt/draw/html.old && mv /opt/draw/html.new /opt/draw/html && docker restart draw-web >/dev/null'
echo "Desplegado en https://draw.awordz.com"
