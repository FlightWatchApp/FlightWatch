#!/usr/bin/env bash
# SPEC-042: atualiza o site (ou faz o primeiro deploy).
#
#   deploy/bin/update.sh              # a versão da branch `release`
#   deploy/bin/update.sh v0.2.0       # uma versão marcada (ou um commit): serve de rollback
#   PREVIEW=1 deploy/bin/update.sh    # também publica o web em 127.0.0.1:3200
#   SKIP_BACKUP=1 deploy/bin/update.sh  # sem o backup de antes (por sua conta e risco)
#
# A produção publica a `release`, nunca a `main`: a `main` recebe todo merge,
# a `release` só avança quando a pessoa responsável promove um commit testado
# (`pnpm release`, no PC). Antes de trocar a versão, faz backup do banco.
#
# Constrói as imagens, roda as migrações (serviço `migrate`) e reinicia o que
# mudou. Termina com erro se o site não ficar saudável em 5 minutos.
#
# Tudo fica dentro de `main`: o `git checkout` abaixo troca este mesmo arquivo
# no disco, e o bash lê o script aos poucos — sem a função, ele leria o
# arquivo novo no meio da execução.
set -euo pipefail
source "$(dirname "$0")/_common.sh"

main() {
  require_env_file
  cd "$REPO_ROOT"

  local ref="${1:-origin/release}"
  case "$ref" in
    main | origin/main | refs/heads/main | refs/remotes/origin/main)
      die "a produção não publica a main. Promova um commit testado com 'pnpm release' (no PC) e rode este script sem argumento."
      ;;
  esac

  git fetch --quiet --tags origin
  git rev-parse -q --verify "$ref^{commit}" >/dev/null ||
    die "não achei '$ref'. Primeira vez? A branch release nasce com 'pnpm release' (no PC)."

  local previous
  previous="$(git rev-parse HEAD)"

  # O maior risco de uma atualização é o banco (migração): copia antes de mexer.
  # Primeiro deploy (banco ainda não existe) não tem o que copiar.
  if [ "${SKIP_BACKUP:-0}" != "1" ] && [ -n "$(compose ps --status running -q postgres 2>/dev/null)" ]; then
    log "backup do banco antes de atualizar"
    "$REPO_ROOT/deploy/bin/backup.sh" ||
      die "o backup falhou: nada foi alterado. Corrija o backup, ou use SKIP_BACKUP=1 por sua conta e risco."
  fi

  log "indo para $ref"
  git checkout --quiet --detach "$ref"
  log "versão: $(git log -1 --format='%h %s')"

  log "construindo as imagens (alguns minutos na primeira vez)"
  compose build

  log "subindo os serviços (as migrações rodam antes da API)"
  compose up -d --remove-orphans

  log "esperando o site ficar saudável"
  local status
  for _ in $(seq 1 60); do
    status="$(docker inspect --format '{{.State.Health.Status}}' "$(compose ps -q web)" 2>/dev/null || true)"
    if [ "$status" = "healthy" ]; then
      compose ps --format 'table {{.Service}}\t{{.Status}}'
      docker image prune -f >/dev/null
      log "pronto: $(git log -1 --format='%h %s')"
      log "para voltar à versão anterior: deploy/bin/update.sh ${previous:0:12}"
      return 0
    fi
    sleep 5
  done
  compose ps --format 'table {{.Service}}\t{{.Status}}'
  die "o web não ficou saudável em 5 minutos — veja os logs (docker compose -p flightwatch logs api web) ou volte: deploy/bin/update.sh ${previous:0:12}"
}

main "$@"
exit $?
