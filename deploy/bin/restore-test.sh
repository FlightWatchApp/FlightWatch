#!/usr/bin/env bash
# SPEC-042: prova que o backup mais recente abre e restaura — num Postgres
# descartável, sem tocar o banco de produção. Rodar depois de cada mudança de
# esquema e uma vez por mês.
#
#   deploy/bin/restore-test.sh [arquivo.dump.enc]
set -euo pipefail
source "$(dirname "$0")/_common.sh"
require_env_file

BACKUP_DIR="${BACKUP_DIR:-/var/backups/flightwatch}"
file="${1:-$(ls -t "$BACKUP_DIR"/flight_watch-*.dump.enc 2>/dev/null | head -n 1 || true)}"
[ -n "$file" ] && [ -f "$file" ] || die "nenhum backup em $BACKUP_DIR"
BACKUP_PASSPHRASE="$(env_value BACKUP_PASSPHRASE)"
export BACKUP_PASSPHRASE

container="fw-restore-test-$$"
cleanup() { docker rm -f "$container" >/dev/null 2>&1 || true; }
trap cleanup EXIT

log "restaurando $file num Postgres descartável"
docker run -d --name "$container" -e POSTGRES_PASSWORD=restore-test postgres:16-alpine >/dev/null
# Por TCP: o servidor temporário da inicialização só escuta no socket local e
# responde pg_isready antes de reiniciar.
ready=0
for _ in $(seq 1 60); do
  if docker exec "$container" pg_isready -h 127.0.0.1 -U postgres >/dev/null 2>&1; then
    ready=1
    break
  fi
  sleep 1
done
[ "$ready" = 1 ] || die "o Postgres descartável não subiu"
docker exec "$container" createdb -U postgres restore_check

openssl enc -d -aes-256-cbc -pbkdf2 -iter 200000 -pass env:BACKUP_PASSPHRASE -in "$file" \
  | docker exec -i "$container" pg_restore -U postgres --no-owner --no-acl -d restore_check

counts="$(docker exec "$container" psql -U postgres -d restore_check -At -c "
  SELECT 'migrações=' || (SELECT count(*) FROM _prisma_migrations WHERE finished_at IS NOT NULL)
    || ' usuários=' || (SELECT count(*) FROM users)
    || ' monitoramentos=' || (SELECT count(*) FROM watches)
    || ' observações=' || (SELECT count(*) FROM price_observations)
    || ' alertas=' || (SELECT count(*) FROM alert_events);")"
[ -n "$counts" ] || die "restauração sem tabelas"
log "restauração ok: $counts"
