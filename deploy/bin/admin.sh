#!/usr/bin/env bash
# SPEC-043: comando de administração dentro do contêiner da API.
#
#   deploy/bin/admin.sh invite  --email pessoa@exemplo.com [--days 30]
#   deploy/bin/admin.sh promote --email dono@exemplo.com
#   deploy/bin/admin.sh demote  --email dono@exemplo.com
#
# `invite` imprime a chave (só aparece aqui). `promote` é o único jeito de
# alguém virar admin: não existe caminho no site.
set -euo pipefail
source "$(dirname "$0")/_common.sh"
require_env_file
cd "$REPO_ROOT"

compose exec -T api node apps/api/dist/cli/admin.js "$@"
