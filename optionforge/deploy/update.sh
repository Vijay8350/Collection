#!/usr/bin/env bash
# Pull the latest code, apply migrations, rebuild, and restart PM2.
# Run on the EC2 box from the project root:  ./deploy/update.sh
set -euo pipefail

cd "$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

echo "▶ git pull"
git pull

echo "▶ npm ci"
npm ci

echo "▶ prisma migrate deploy"
npm run setup

echo "▶ build"
npm run build

echo "▶ reload PM2"
pm2 reload ecosystem.config.cjs
pm2 save

echo "✓ Updated. If shopify.app.toml or extensions/ changed, run 'npm run deploy' from your LOCAL machine too."
