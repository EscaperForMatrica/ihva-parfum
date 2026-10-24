#!/bin/sh
# Выкладка на хостинг lite-host (cPanel + Phusion Passenger, Node.js из /opt/alt).
# Приложение — в ~/ihva-app, база заявок — в ~/ihva-data (при выкладке не трогается), .env лежит только на сервере.
#   DEPLOY_HOST=mars.lite-host.in sh scripts/deploy.sh
set -e
HOST="${DEPLOY_HOST:?Укажите DEPLOY_HOST — SSH-хост из ~/.ssh/config}"
APP="${APP_ROOT:-ihva-app}"
NODE_BIN="${APP_NODE_BIN:-/opt/alt/alt-nodejs24/root/usr/bin}"

ssh "$HOST" "mkdir -p ~/$APP/tmp ~/ihva-data"
rsync -az --delete --exclude=.git --exclude=.env --exclude=storage --exclude=node_modules --exclude=tmp --exclude=test \
  server pages public data package.json app.cjs "$HOST:$APP/"
ssh "$HOST" "set -e; cd ~/$APP; touch tmp/restart.txt; echo 'Готово: Passenger перезапустит приложение при следующем запросе'"
