#!/usr/bin/env bash
# SPEC-042: prepara um Ubuntu 24.04 novo para o Flight Watch. Rodar UMA vez,
# como root, logo depois de criar o servidor:
#
#   ssh root@IP "bash -s -- '$(cat ~/.ssh/id_ed25519.pub)'" < deploy/bin/setup-server.sh
#
# Cria o usuário `deploy` (sudo e Docker), coloca a sua chave pública nele,
# desliga login por senha e de root no SSH, fecha o firewall (só a porta 22),
# liga fail2ban e atualizações automáticas de segurança e instala o Docker.
# ANTES de fechar a sessão root, teste em outro terminal: ssh deploy@IP
set -euo pipefail

[ "$(id -u)" = "0" ] || { echo "rode como root" >&2; exit 1; }
[ "${1:-}" = "--" ] && shift
PUBKEY="${1:-}"
[ -n "$PUBKEY" ] || { echo "passe a sua chave pública SSH (conteúdo de ~/.ssh/id_ed25519.pub)" >&2; exit 1; }
case "$PUBKEY" in ssh-ed25519\ *|ssh-rsa\ *|ecdsa-sha2-*) ;; *) echo "isso não parece uma chave pública SSH" >&2; exit 1 ;; esac

export DEBIAN_FRONTEND=noninteractive
apt-get update -q
apt-get upgrade -yq
apt-get install -yq ca-certificates curl git ufw fail2ban unattended-upgrades openssl rclone

# Usuário de trabalho, com a chave informada.
id deploy >/dev/null 2>&1 || adduser --disabled-password --gecos '' deploy
usermod -aG sudo deploy
echo 'deploy ALL=(ALL) NOPASSWD:ALL' > /etc/sudoers.d/90-deploy
chmod 440 /etc/sudoers.d/90-deploy
install -d -m 700 -o deploy -g deploy /home/deploy/.ssh
grep -qxF "$PUBKEY" /home/deploy/.ssh/authorized_keys 2>/dev/null || echo "$PUBKEY" >> /home/deploy/.ssh/authorized_keys
chown deploy:deploy /home/deploy/.ssh/authorized_keys
chmod 600 /home/deploy/.ssh/authorized_keys

# SSH só com chave, sem root.
cat > /etc/ssh/sshd_config.d/90-flightwatch.conf <<'CONF'
PasswordAuthentication no
KbdInteractiveAuthentication no
PermitRootLogin no
CONF
sshd -t
systemctl reload ssh

# Firewall: só SSH. O site entra pelo Cloudflare Tunnel (conexão de saída).
ufw default deny incoming
ufw default allow outgoing
ufw allow OpenSSH
ufw --force enable

systemctl enable --now fail2ban
dpkg-reconfigure -f noninteractive unattended-upgrades

# Docker (repositório oficial).
if ! command -v docker >/dev/null; then
  install -m 0755 -d /etc/apt/keyrings
  curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
  chmod a+r /etc/apt/keyrings/docker.asc
  . /etc/os-release
  echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu $VERSION_CODENAME stable" \
    > /etc/apt/sources.list.d/docker.list
  apt-get update -q
  apt-get install -yq docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
fi
usermod -aG docker deploy
systemctl enable --now docker

# Pasta dos backups, só do usuário deploy.
install -d -m 700 -o deploy -g deploy /var/backups/flightwatch

echo
echo "pronto. Em OUTRO terminal, confira: ssh deploy@$(hostname -I | awk '{print $1}')"
echo "só feche esta sessão root depois que esse login funcionar."
