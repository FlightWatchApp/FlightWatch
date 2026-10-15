#!/usr/bin/env bash
# SPEC-042: backup dos bancos (Flight Watch e Umami), criptografado com
# AES-256 (openssl, senha BACKUP_PASSPHRASE). Guarda 14 dias em BACKUP_DIR e,
# com BACKUP_RCLONE_REMOTE, copia para fora do servidor. Feito para o cron.
set -euo pipefail
source "$(dirname "$0")/_common.sh"
require_env_file

BACKUP_DIR="${BACKUP_DIR:-/var/backups/flightwatch}"
RETENTION_DAYS="${RETENTION_DAYS:-14}"
BACKUP_PASSPHRASE="$(env_value BACKUP_PASSPHRASE)"
[ -n "$BACKUP_PASSPHRASE" ] || die "BACKUP_PASSPHRASE vazia no .env.production"
export BACKUP_PASSPHRASE

umask 077
mkdir -p "$BACKUP_DIR"
stamp="$(date -u +%Y%m%dT%H%M%SZ)"

for db in flight_watch umami; do
  out="$BACKUP_DIR/$db-$stamp.dump.enc"
  compose exec -T postgres pg_dump -U flight_watch --format=custom "$db" \
    | openssl enc -aes-256-cbc -pbkdf2 -iter 200000 -salt -pass env:BACKUP_PASSPHRASE -out "$out"
  [ -s "$out" ] || die "backup vazio: $out"
  log "backup ok: $out ($(du -h "$out" | cut -f1))"
done

find "$BACKUP_DIR" -name '*.dump.enc' -mtime "+$RETENTION_DAYS" -print -delete

remote="$(env_value BACKUP_RCLONE_REMOTE)"
if [ -n "$remote" ]; then
  command -v rclone >/dev/null || die "BACKUP_RCLONE_REMOTE definido, mas o rclone não está instalado"
  rclone copy "$BACKUP_DIR" "$remote" --include '*.dump.enc' --max-age 2d
  log "cópia fora do servidor ok: $remote"
fi
