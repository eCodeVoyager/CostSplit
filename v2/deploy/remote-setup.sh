#!/usr/bin/env bash
# Runs on the server (piped by deploy.sh). Idempotent: only creates what is missing.
set -euo pipefail
domain=$1
dir=$2
port=8790
cd "$dir"

mkdir -p data
chmod 700 data
if [ ! -f .env ]; then
  (umask 077 && cat > .env <<'EOF'
# CostSplit secrets, loaded at start (node --env-file). After editing: pm2 restart costsplit
# Sign-in codes are emailed with Resend (https://resend.com, sender domain verified there).
# Until both are set, sign-in answers "Email sign-in isn't set up on this server yet".
# RESEND_API_KEY=re_...
# MAIL_FROM=CostSplit <login@example.com>
EOF
  )
  echo "Created $dir/.env (no email key yet)"
fi

# Swap in the new release; the old one stays as *.prev for a manual rollback
if [ -d incoming/dist ]; then
  # Tabs still on the previous version may lazy-load its hashed chunks after the swap
  if [ -d dist/assets ]; then cp -n dist/assets/* incoming/dist/assets/ 2>/dev/null || true; fi
  rm -rf server.prev dist.prev
  if [ -d server ]; then mv server server.prev; fi
  if [ -d dist ]; then mv dist dist.prev; fi
  mv incoming/server server
  mv incoming/dist dist
  rm -rf incoming
fi

cert=/etc/nginx/ssl/costsplit.crt
if [ ! -f "$cert" ]; then
  echo "Creating the origin certificate (Cloudflare checks it in Full mode)"
  mkdir -p /etc/nginx/ssl
  openssl req -x509 -newkey rsa:2048 -nodes -days 3650 -subj "/CN=$domain" \
    -addext "subjectAltName=DNS:$domain" -keyout /etc/nginx/ssl/costsplit.key -out "$cert" 2>/dev/null
  chmod 600 /etc/nginx/ssl/costsplit.key
fi

site=/etc/nginx/sites-available/costsplit
link=/etc/nginx/sites-enabled/costsplit
sed -e "s/DOMAIN/$domain/g" -e "s/PORT/$port/g" "$dir/nginx-costsplit.conf" > "$site.new"
if ! cmp -s "$site.new" "$site" 2>/dev/null; then
  # Other sites share this nginx. A config that fails nginx -t must not stay behind:
  # reload would keep the old one, but the next restart (a reboot) would take every site down.
  nginx -t -q || { rm "$site.new"; echo "nginx -t fails before this change; leaving nginx alone"; exit 1; }
  if [ -f "$site" ]; then cp -p "$site" "$site.prev"; fi
  mv "$site.new" "$site"
  ln -sf "$site" "$link"
  if ! nginx -t -q; then
    if [ -f "$site.prev" ]; then mv "$site.prev" "$site"; else rm -f "$site" "$link"; fi
    echo "nginx rejected the costsplit site; restored the previous state"
    exit 1
  fi
  rm -f "$site.prev"
  systemctl reload nginx
  echo "nginx site for $domain installed"
else
  rm "$site.new"
fi

pm2 startOrReload "$dir/ecosystem.config.cjs" --update-env >/dev/null
pm2 save >/dev/null
sleep 2
local=http://127.0.0.1:$port
echo "Health:   $(curl -s -o /dev/null -w '%{http_code}' $local/api/health)"
echo "App:      $(curl -s -o /dev/null -w '%{http_code}' $local/t/check-route)"
echo "Download: $(curl -s -o /dev/null -w '%{http_code}' $local/download/) $(curl -s $local/download/version.json | tr -d '\n ' | cut -c1-60)"
echo "APK:      $(curl -s -o /dev/null -w '%{http_code} %{content_type}' -I $local/download/costsplit.apk)"
# Resend test inbox: really sends, but only to Resend (example.com is refused)
echo "Sign-in:  $(curl -s -o /dev/null -w '%{http_code}' -X POST -H 'Content-Type: application/json' -d '{"email":"delivered@resend.dev"}' $local/api/auth/start) (200 = code emailed, 503 = no RESEND_API_KEY, 502 = Resend refused, see pm2 logs)"
