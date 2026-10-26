#!/usr/bin/env bash
# Publica uma versão: promove a `main` (código testado) para a branch `release`
# (o que a produção usa). Roda no seu PC, não no servidor.
#
#   pnpm release                      # main → release, depois de conferir o CI
#   pnpm release --tag v0.2.0         # idem, e marca a versão com uma tag
#   pnpm release --dry-run            # só mostra o que aconteceria
#   pnpm release --sem-ci             # promove sem a conferência do CI (emergência; diga o motivo no PR)
#   pnpm release --yes                # sem perguntar
#
# Só avança em linha reta (fast-forward): `release` nunca tem commit que a
# `main` não tem, e o git recusa um push que reescreva o histórico. Depois de
# promover, publique no servidor com `deploy/bin/update.sh` (README do deploy).
set -euo pipefail

cd "$(git rev-parse --show-toplevel)"

dry_run=0
skip_ci=0
assume_yes=0
tag=""
while [ $# -gt 0 ]; do
  case "$1" in
    --dry-run) dry_run=1 ;;
    --sem-ci) skip_ci=1 ;;
    --yes) assume_yes=1 ;;
    --tag)
      shift
      tag="${1:-}"
      ;;
    *)
      echo "argumento desconhecido: $1" >&2
      exit 2
      ;;
  esac
  shift
done

die() {
  echo "erro: $*" >&2
  exit 1
}

if [ -n "$tag" ]; then
  [[ "$tag" =~ ^v[0-9]+\.[0-9]+\.[0-9]+$ ]] || die "tag no formato vMAIOR.MENOR.PATCH (ex.: v0.2.0), recebi '$tag'"
  if git rev-parse -q --verify "refs/tags/$tag" >/dev/null || git ls-remote --exit-code --tags origin "$tag" >/dev/null 2>&1; then
    die "a tag $tag já existe"
  fi
fi

git fetch --quiet origin --tags
git rev-parse -q --verify origin/main >/dev/null || die "não achei origin/main"
main_sha="$(git rev-parse origin/main)"

release_exists=0
if git rev-parse -q --verify origin/release >/dev/null; then
  release_exists=1
  release_sha="$(git rev-parse origin/release)"
  if [ "$release_sha" = "$main_sha" ]; then
    echo "release já está na main ($(git log -1 --format='%h %s' "$main_sha")). Nada a promover."
    exit 0
  fi
  git merge-base --is-ancestor "$release_sha" "$main_sha" ||
    die "release tem commits que a main não tem (não é fast-forward). Não mexa na release por fora: resolva antes."
fi

echo "main:    $(git log -1 --format='%h %s' "$main_sha")"
if [ "$release_exists" = 1 ]; then
  echo "release: $(git log -1 --format='%h %s' "$release_sha")"
  echo
  echo "Vai para a produção (commits novos):"
  git log --format='  %h %s' "$release_sha..$main_sha"
else
  echo "release: (ainda não existe — será criada neste commit)"
fi
echo

# O CI da main precisa estar verde: é a prova de que o que vai para o ar passou
# nos gates. A API pública do GitHub basta (o repositório é público).
if [ "$skip_ci" = 0 ]; then
  slug="$(git remote get-url origin | sed -E 's#^(git@github\.com:|https://github\.com/)##; s#\.git$##')"
  if ! runs="$(curl -fsS "https://api.github.com/repos/$slug/commits/$main_sha/check-runs?per_page=100")"; then
    die "não consegui consultar o CI no GitHub (limite de consultas ou sem rede). Confira o CI da main à mão e rode de novo com --sem-ci."
  fi
  summary="$(printf '%s' "$runs" | node -e '
    const runs = JSON.parse(require("fs").readFileSync(0, "utf8")).check_runs ?? [];
    const bad = runs.filter((r) => r.status !== "completed" || !["success", "skipped", "neutral"].includes(r.conclusion));
    console.log(JSON.stringify({ total: runs.length, bad: bad.map((r) => `${r.name}=${r.conclusion ?? r.status}`) }));
  ')"
  total="$(printf '%s' "$summary" | node -e 'console.log(JSON.parse(require("fs").readFileSync(0, "utf8")).total)')"
  bad="$(printf '%s' "$summary" | node -e 'console.log(JSON.parse(require("fs").readFileSync(0, "utf8")).bad.join(", "))')"
  [ "$total" -gt 0 ] || die "o CI ainda não rodou nesse commit da main. Espere e tente de novo."
  [ -z "$bad" ] || die "o CI da main não está verde: $bad. Corrija antes de promover."
  echo "CI da main: $total checagens, todas verdes."
fi

if [ "$dry_run" = 1 ]; then
  echo "(--dry-run) nada foi publicado."
  exit 0
fi

if [ "$assume_yes" = 0 ]; then
  read -r -p "Promover para a release${tag:+ e marcar $tag}? [s/N] " answer
  [ "$answer" = "s" ] || [ "$answer" = "S" ] || die "cancelado"
fi

# Sem --force de propósito: se alguém reescreveu a release, o git recusa.
git push origin "$main_sha:refs/heads/release"
if [ -n "$tag" ]; then
  git tag -a "$tag" "$main_sha" -m "Versão $tag"
  git push origin "refs/tags/$tag"
fi
echo
echo "release agora em $(git log -1 --format='%h %s' "$main_sha")${tag:+ ($tag)}."
echo "Para publicar no servidor: ssh deploy@IP, cd flightwatch, deploy/bin/update.sh"
