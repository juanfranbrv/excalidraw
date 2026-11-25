#!/usr/bin/env bash
# Publica Awordz Draw en draw.awordz.com (VPS hermes-vps).
#   bash deploy.sh          -> web y servidor
#   bash deploy.sh web      -> solo la web
#   bash deploy.sh server   -> solo el servidor (API + colaboración)
# La contraseña del equipo vive en el VPS, en /opt/draw/server.env.
set -euo pipefail
cd "$(dirname "$0")"
TARGET="${1:-all}"

if [ "$TARGET" = "all" ] || [ "$TARGET" = "web" ]; then
  npx --yes yarn@1 install --frozen-lockfile
  npx --yes yarn@1 build:app:docker
  tar -C excalidraw-app/build -czf - . | ssh hermes-vps 'rm -rf /opt/draw/html.new && mkdir -p /opt/draw/html.new && tar -C /opt/draw/html.new -xzf - && rm -rf /opt/draw/html.old && mv /opt/draw/html /opt/draw/html.old && mv /opt/draw/html.new /opt/draw/html && docker restart draw-web >/dev/null'
  echo "Web publicada."
fi

if [ "$TARGET" = "all" ] || [ "$TARGET" = "server" ]; then
  tar -C server -czf - Dockerfile package.json package-lock.json index.mjs .dockerignore | ssh hermes-vps 'set -e; mkdir -p /opt/draw/server /opt/draw/data && tar -C /opt/draw/server -xzf - && docker build -q -t draw-server:latest /opt/draw/server >/dev/null && (docker rm -f draw-server >/dev/null 2>&1 || true) && docker run -d --name draw-server --restart unless-stopped --network dokploy-network --env-file /opt/draw/server.env -v /opt/draw/data:/data draw-server:latest >/dev/null'
  echo "Servidor publicado."
fi

echo "https://draw.awordz.com"
