#!/usr/bin/env bash
# Deploy do Clinic Control na VPS: puxa o Git, rebuilda a imagem e troca o
# container. Uso: cd ~/clinic-control/app && ./deploy/deploy.sh
set -euo pipefail

cd "$(dirname "$0")/.."

if [ ! -f .env ]; then
  echo "ERRO: .env não encontrado na raiz. Ver deploy/README.md, passo 3." >&2
  exit 1
fi

# Carrega o .env no ambiente do shell para o compose interpolar os build args
# das NEXT_PUBLIC_* (env_file não alimenta interpolação, só runtime).
set -a
# shellcheck disable=SC1091
. ./.env
set +a

./deploy/verificar-env.sh

echo "==> git pull"
git pull --ff-only

echo "==> build + troca do container"
docker compose up -d --build app

echo "==> limpando imagens órfãs"
docker image prune -f

echo "==> aguardando o app responder"
for _ in $(seq 1 45); do
  # `< /dev/null` não é decorativo: `docker compose exec -T` lê stdin e, se o
  # script estiver sendo alimentado por pipe ou heredoc, engole o resto dele
  # (o comando seguinte simplesmente não roda, sem erro nenhum).
  if docker compose exec -T app node -e \
      "fetch('http://127.0.0.1:3000/login').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))" \
      < /dev/null 2>/dev/null; then
    echo "OK — app saudável"
    docker compose ps
    exit 0
  fi
  sleep 2
done

echo "FALHOU — o app não respondeu em /login. Últimos logs:" >&2
docker compose logs --tail=60 app >&2
exit 1
