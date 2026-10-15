# SPEC-042: funções comuns dos scripts de deploy (carregado com `source`).
# Sempre a partir da raiz do repositório.
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
ENV_FILE="${ENV_FILE:-$REPO_ROOT/deploy/.env.production}"

die() {
  echo "erro: $*" >&2
  exit 1
}

log() {
  echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] $*"
}

# Valor de uma chave do .env.production, sem carregar o arquivo no shell
# (valores com JSON ou espaços não são reinterpretados). Nunca imprime segredos.
env_value() {
  local line
  line="$(grep -E "^$1=" "$ENV_FILE" | tail -n 1 || true)"
  printf '%s' "${line#*=}"
}

require_env_file() {
  [ -f "$ENV_FILE" ] || die "não achei $ENV_FILE (copie deploy/env.production.example e preencha)"
  local mode
  mode="$(stat -c '%a' "$ENV_FILE")"
  [ "$mode" = "600" ] || die "$ENV_FILE precisa de permissão 600 (rode: chmod 600 $ENV_FILE)"
}

compose() {
  local files=(-f "$REPO_ROOT/deploy/compose.production.yml")
  if [ "${PREVIEW:-0}" = "1" ]; then
    files+=(-f "$REPO_ROOT/deploy/compose.preview.yml")
  fi
  local profiles=()
  if [ -n "$(env_value CLOUDFLARE_TUNNEL_TOKEN)" ]; then
    profiles=(--profile tunnel)
  fi
  docker compose --env-file "$ENV_FILE" "${files[@]}" "${profiles[@]}" "$@"
}
