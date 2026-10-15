#!/usr/bin/env bash
# SPEC-042: atualiza o site (ou faz o primeiro deploy).
#
#   deploy/bin/update.sh              # última versão da main
#   deploy/bin/update.sh <commit>     # versão específica (rollback)
#   PREVIEW=1 deploy/bin/update.sh    # também publica o web em 127.0.0.1:3200
#
# Constrói as imagens, roda as migrações (serviço `migrate`) e reinicia o que
# mudou. Termina com erro se o site não ficar saudável em 5 minutos.
set -euo pipefail
source "$(dirname "$0")/_common.sh"
require_env_file
cd "$REPO_ROOT"

ref="${1:-origin/main}"
log "buscando $ref"
git fetch --quiet origin
git checkout --quiet --detach "$ref"
log "versão: $(git log -1 --format='%h %s')"

log "construindo as imagens (alguns minutos na primeira vez)"
compose build

log "subindo os serviços (as migrações rodam antes da API)"
compose up -d --remove-orphans

log "esperando o site ficar saudável"
for _ in $(seq 1 60); do
  status="$(docker inspect --format '{{.State.Health.Status}}' "$(compose ps -q web)" 2>/dev/null || true)"
  if [ "$status" = "healthy" ]; then
    compose ps --format 'table {{.Service}}\t{{.Status}}'
    docker image prune -f >/dev/null
    log "pronto: $(git log -1 --format='%h')"
    exit 0
  fi
  sleep 5
done
compose ps --format 'table {{.Service}}\t{{.Status}}'
die "o web não ficou saudável em 5 minutos — veja: docker compose ... logs api web (ou deploy/bin/update.sh <commit anterior> para voltar)"
