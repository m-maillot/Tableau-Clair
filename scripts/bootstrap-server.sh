#!/usr/bin/env bash
# Prépare un VPS Ubuntu 22.04/24.04 neuf pour héberger Tableau Clair.
#
# À lancer UNE FOIS, en root (ou via sudo), sur le serveur :
#   curl -fsSL <url-du-script> -o bootstrap-server.sh   # ou scp depuis ta machine
#   sudo DEPLOY_PUBLIC_KEY="ssh-ed25519 AAAA... deploy" bash bootstrap-server.sh
#
# Ce que fait le script (idempotent, relançable sans risque) :
#   - mises à jour système + mises à jour de sécurité automatiques
#   - utilisateur `deploy` (clé SSH, groupe docker, pas de mot de passe)
#   - Docker Engine + plugin compose (dépôt officiel)
#   - pare-feu ufw : 22, 80, 443 uniquement
#   - SSH durci : pas de root, pas de mot de passe (APRÈS vérification de la clé)
#   - fail2ban sur SSH
#   - swap de 2 Go
#   - dossier /opt/tableau-clair appartenant à `deploy`
set -euo pipefail

DEPLOY_USER="${DEPLOY_USER:-deploy}"
APP_DIR="${APP_DIR:-/opt/tableau-clair}"
SWAP_SIZE="${SWAP_SIZE:-2G}"
# Clé publique SSH autorisée pour l'utilisateur de déploiement (obligatoire).
DEPLOY_PUBLIC_KEY="${DEPLOY_PUBLIC_KEY:-}"

log() { printf '\n\033[1;34m==> %s\033[0m\n' "$*"; }

if [[ $EUID -ne 0 ]]; then
  echo "Ce script doit être lancé en root (sudo)." >&2
  exit 1
fi

if [[ -z "$DEPLOY_PUBLIC_KEY" ]]; then
  echo "DEPLOY_PUBLIC_KEY est vide : fournis la clé publique SSH de l'utilisateur ${DEPLOY_USER}." >&2
  echo "Exemple : sudo DEPLOY_PUBLIC_KEY=\"\$(cat ~/.ssh/id_ed25519.pub)\" bash $0" >&2
  exit 1
fi

if [[ ! -r /etc/os-release ]] || ! grep -qi '^ID=ubuntu' /etc/os-release; then
  echo "Script prévu pour Ubuntu (22.04 / 24.04)." >&2
  exit 1
fi

export DEBIAN_FRONTEND=noninteractive

# --- Système ------------------------------------------------------------------
log "Mise à jour du système"
apt-get update -y
apt-get upgrade -y
apt-get install -y ca-certificates curl gnupg ufw fail2ban unattended-upgrades

log "Mises à jour de sécurité automatiques"
cat >/etc/apt/apt.conf.d/20auto-upgrades <<'EOF'
APT::Periodic::Update-Package-Lists "1";
APT::Periodic::Unattended-Upgrade "1";
APT::Periodic::AutocleanInterval "7";
EOF

# --- Swap ---------------------------------------------------------------------
if ! swapon --show | grep -q .; then
  log "Création du swap (${SWAP_SIZE})"
  fallocate -l "$SWAP_SIZE" /swapfile
  chmod 600 /swapfile
  mkswap /swapfile
  swapon /swapfile
  grep -q '^/swapfile ' /etc/fstab || echo '/swapfile none swap sw 0 0' >>/etc/fstab
  # Le swap n'est qu'un filet de sécurité : on évite de l'utiliser tant que possible.
  echo 'vm.swappiness=10' >/etc/sysctl.d/99-swappiness.conf
  sysctl -p /etc/sysctl.d/99-swappiness.conf
else
  log "Swap déjà présent, rien à faire"
fi

# --- Docker -------------------------------------------------------------------
if ! command -v docker >/dev/null 2>&1; then
  log "Installation de Docker"
  install -m 0755 -d /etc/apt/keyrings
  curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
  chmod a+r /etc/apt/keyrings/docker.asc
  # shellcheck disable=SC1091
  . /etc/os-release
  echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu ${VERSION_CODENAME} stable" \
    >/etc/apt/sources.list.d/docker.list
  apt-get update -y
  apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
else
  log "Docker déjà installé"
fi
systemctl enable --now docker

# Rotation des logs : sans ça, les logs des conteneurs grossissent sans limite.
cat >/etc/docker/daemon.json <<'EOF'
{
  "log-driver": "json-file",
  "log-opts": { "max-size": "10m", "max-file": "3" }
}
EOF
systemctl restart docker

# --- Utilisateur de déploiement -----------------------------------------------
if ! id "$DEPLOY_USER" >/dev/null 2>&1; then
  log "Création de l'utilisateur ${DEPLOY_USER}"
  adduser --disabled-password --gecos "" "$DEPLOY_USER"
fi
usermod -aG docker "$DEPLOY_USER"

install -d -m 700 -o "$DEPLOY_USER" -g "$DEPLOY_USER" "/home/${DEPLOY_USER}/.ssh"
AUTH_KEYS="/home/${DEPLOY_USER}/.ssh/authorized_keys"
touch "$AUTH_KEYS"
grep -qxF "$DEPLOY_PUBLIC_KEY" "$AUTH_KEYS" || echo "$DEPLOY_PUBLIC_KEY" >>"$AUTH_KEYS"
chmod 600 "$AUTH_KEYS"
chown "$DEPLOY_USER:$DEPLOY_USER" "$AUTH_KEYS"

install -d -m 750 -o "$DEPLOY_USER" -g "$DEPLOY_USER" "$APP_DIR"

# --- Pare-feu -----------------------------------------------------------------
log "Pare-feu ufw (22, 80, 443)"
ufw default deny incoming
ufw default allow outgoing
ufw allow 22/tcp
ufw allow 80/tcp
ufw allow 443/tcp
ufw --force enable

# --- fail2ban -----------------------------------------------------------------
log "fail2ban (SSH)"
cat >/etc/fail2ban/jail.d/sshd.local <<'EOF'
[sshd]
enabled = true
maxretry = 5
bantime = 1h
findtime = 10m
EOF
systemctl enable --now fail2ban
systemctl restart fail2ban

# --- SSH durci ----------------------------------------------------------------
# Ne verrouille l'accès que si la clé de déploiement est bien en place.
if [[ -s "$AUTH_KEYS" ]]; then
  log "Durcissement SSH (pas de root, pas de mot de passe)"
  cat >/etc/ssh/sshd_config.d/99-tableau-clair.conf <<'EOF'
PermitRootLogin no
PasswordAuthentication no
KbdInteractiveAuthentication no
PubkeyAuthentication yes
EOF
  sshd -t
  systemctl reload ssh || systemctl reload sshd
fi

log "Terminé"
cat <<EOF

Serveur prêt. Prochaines étapes :
  1. DEPUIS TON POSTE, dans un AUTRE terminal (garde celui-ci ouvert), vérifie :
       ssh ${DEPLOY_USER}@<IP-du-serveur>
     Si ça marche, tu peux fermer la session root/ubuntu.
  2. Copie le projet : docker-compose.prod.yml, Caddyfile et .env dans ${APP_DIR}.
  3. Vérifie que le DNS de ton domaine pointe sur ce serveur, puis :
       cd ${APP_DIR} && docker compose -f docker-compose.prod.yml --env-file .env up -d --build

EOF
