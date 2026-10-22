#!/usr/bin/env bash
# Installa Registratore riunioni su un server Ubuntu (es. Oracle Cloud Always Free).
# Uso: curl -fsSL https://raw.githubusercontent.com/RobyMada/registratore-riunioni/main/deploy/oracle-setup.sh | bash
set -euo pipefail

REPO=https://github.com/RobyMada/registratore-riunioni
DIR="$HOME/registratore-riunioni"
WHISPER_MODEL="${WHISPER_MODEL:-small}"

echo "==> Installo Docker e git"
sudo apt-get update -y
sudo apt-get install -y docker.io git curl
sudo systemctl enable --now docker

echo "==> Scarico l'app"
if [ -d "$DIR/.git" ]; then git -C "$DIR" pull --ff-only; else git clone "$REPO" "$DIR"; fi
cd "$DIR"

if [ ! -f .env ]; then
  PASSWORD=$(tr -dc 'a-z0-9' < /dev/urandom | head -c 12)
  printf 'APP_PASSWORD=%s\n' "$PASSWORD" > .env
  echo "==> Password dell'app generata: $PASSWORD (la trovi anche in $DIR/.env)"
fi

echo "==> Costruisco l'immagine (Whisper incluso, può richiedere 10-20 minuti)"
sudo docker build --build-arg WHISPER_MODEL="$WHISPER_MODEL" -t registratore-riunioni .

echo "==> Avvio l'app"
sudo docker rm -f registratore-riunioni >/dev/null 2>&1 || true
sudo docker run -d --name registratore-riunioni --restart unless-stopped \
  -p 127.0.0.1:3000:3000 -v registratore-dati:/data --env-file .env registratore-riunioni

echo "==> Installo Tailscale per l'indirizzo HTTPS pubblico"
command -v tailscale >/dev/null || curl -fsSL https://tailscale.com/install.sh | sh
sudo tailscale up
sudo tailscale funnel --bg 3000

echo
echo "Fatto. L'indirizzo dell'app è quello https://...ts.net mostrato qui sopra."
echo "Aprilo dal telefono, inserisci la password e aggiungi l'app alla schermata Home."
