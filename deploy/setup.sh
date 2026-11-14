#!/usr/bin/env bash
# ProSupply — yangi Ubuntu 24.04 serverni tayyorlaş.
# Işlatiş (root sifatida):  bash setup.sh
# Bir necha marta işga tuşirsa ham xavfsiz.
set -euo pipefail

REPO="git@github.com:SirojiddinBakhadirov/prosupply-platform.git"
APP_DIR="/opt/prosupply"

echo "== 1/6 Tizimni yangilaş va kerakli dasturlar =="
export DEBIAN_FRONTEND=noninteractive
apt-get update -y
apt-get upgrade -y
apt-get install -y ca-certificates curl git ufw fail2ban unattended-upgrades \
  docker.io docker-compose-v2
systemctl enable --now docker
dpkg-reconfigure -f noninteractive unattended-upgrades

echo "== 2/6 Firewall: faqat SSH, HTTP, HTTPS =="
ufw allow OpenSSH
ufw allow 80/tcp
ufw allow 443/tcp
ufw --force enable

echo "== 3/6 SSH: parol bilan kirişni öçiriş (faqat kalit) =="
mkdir -p /etc/ssh/sshd_config.d
cat > /etc/ssh/sshd_config.d/99-prosupply.conf <<'EOF'
PasswordAuthentication no
KbdInteractiveAuthentication no
PermitRootLogin prohibit-password
EOF
systemctl reload ssh || systemctl reload sshd || true

echo "== 4/6 Swap (2 GB) =="
if ! swapon --show | grep -q /swapfile; then
  fallocate -l 2G /swapfile && chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile
  grep -q '/swapfile' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
fi

echo "== 5/6 GitHub dan loyihani yuklab oliş =="
if [ ! -f /root/.ssh/github_deploy ]; then
  ssh-keygen -t ed25519 -N "" -C "prosupply-server" -f /root/.ssh/github_deploy >/dev/null
fi
cat > /root/.ssh/config <<'EOF'
Host github.com
  IdentityFile /root/.ssh/github_deploy
  IdentitiesOnly yes
  StrictHostKeyChecking accept-new
EOF
if [ ! -d "$APP_DIR/.git" ]; then
  until git clone "$REPO" "$APP_DIR" 2>/dev/null; do
    echo
    echo ">>> Quyidagi kalitni GitHub ga qöşing:"
    echo ">>> Repository → Settings → Deploy keys → Add deploy key (Allow write access BELGILAMANG)"
    echo
    cat /root/.ssh/github_deploy.pub
    echo
    read -rp "Qöşib bölgaç, Enter bosing... " _
  done
else
  git -C "$APP_DIR" pull --ff-only
fi
cd "$APP_DIR"

echo "== 6/6 .env faylini tayyorlaş =="
if [ ! -f .env ]; then
  rnd() { tr -dc 'A-Za-z0-9' </dev/urandom | head -c "$1"; }
  read -rp "Domen [prosupply.uz]: " DOMAIN; DOMAIN=${DOMAIN:-prosupply.uz}
  read -rp "Panel uçun admin email: " ADMIN_EMAIL
  while :; do
    read -rsp "Panel uçun admin parol (kamida 12 belgi): " ADMIN_PASSWORD; echo
    [ ${#ADMIN_PASSWORD} -ge 12 ] && break; echo "Parol juda qisqa."
  done
  read -rp "Telegram bot token (hozir yöq bölsa Enter): " TG_TOKEN
  cat > .env <<EOF
DOMAIN=$DOMAIN
POSTGRES_DB=prosupply
POSTGRES_USER=prosupply
POSTGRES_PASSWORD=$(rnd 32)
ADMIN_EMAIL=$ADMIN_EMAIL
ADMIN_PASSWORD=$ADMIN_PASSWORD
SESSION_SECRET=$(rnd 64)
TELEGRAM_BOT_TOKEN=$TG_TOKEN
TELEGRAM_CHAT_ID=
EOF
  chmod 600 .env
  echo ".env yaratildi."
else
  echo ".env allaqaçon bor, tegmadim."
fi

docker compose up -d --build

# Har kuni 03:00 da baza zaxirasi
chmod +x deploy/backup.sh
( crontab -l 2>/dev/null | grep -v 'deploy/backup.sh'; echo "0 3 * * * cd $APP_DIR && ./deploy/backup.sh >> /var/log/prosupply-backup.log 2>&1" ) | crontab -

echo
echo "Tayyor! Holat:"
docker compose ps
echo
echo "Sayt:  https://$(grep ^DOMAIN= .env | cut -d= -f2)"
echo "Panel: https://$(grep ^DOMAIN= .env | cut -d= -f2)/panel"
echo "(DNS hali ulanmagan bölsa, https bir oz keyin işlaydi.)"
