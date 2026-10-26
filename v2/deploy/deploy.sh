#!/usr/bin/env bash
# Ships the sync server + built web app (with /download and the APK) to a host and
# (re)starts it under pm2 behind nginx. Safe to run again for updates.
#   npm run release && deploy/deploy.sh <ssh host> <domain>    e.g. deploy/deploy.sh s3 costsplit.tapspot.tech
# Secrets (RESEND_API_KEY, MAIL_FROM) live in /opt/costsplit/.env on the host, never in this repo.
set -euo pipefail

host=${1:?usage: deploy.sh <ssh host> <domain>}
domain=${2:?usage: deploy.sh <ssh host> <domain>}
dir=/opt/costsplit
root=$(cd "$(dirname "$0")/.." && pwd)

if [ ! -f "$root/dist/index.html" ] || [ ! -f "$root/dist/download/version.json" ]; then
  echo "dist/ has no release build. Run: npm run release"
  exit 1
fi

version=$(sed -n 's/.*"version": *"\([^"]*\)".*/\1/p' "$root/dist/download/version.json")
echo "Copying server and web app $version to $host:$dir"
# Unpacked into incoming/ first; remote-setup.sh swaps it in, so the live folders are never half-written.
tar -C "$root" --exclude='*.test.mjs' -czf - server dist \
  | ssh "$host" "mkdir -p $dir && rm -rf $dir/incoming && mkdir $dir/incoming && tar -C $dir/incoming --no-same-owner -xzf -"
scp -q "$root/deploy/ecosystem.config.cjs" "$root/deploy/nginx-costsplit.conf" "$host:$dir/"
ssh "$host" bash -s -- "$domain" "$dir" < "$root/deploy/remote-setup.sh"
