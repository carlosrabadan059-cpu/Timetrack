#!/bin/sh
# Programa backup.sh con crond (busybox) y se queda en primer plano.
set -eu

: "${BACKUP_CRON:=30 3 * * *}"

echo "${BACKUP_CRON} /usr/local/bin/backup.sh >> /proc/1/fd/1 2>&1" > /etc/crontabs/root
echo "[backup] cron programado: ${BACKUP_CRON} (TZ=${TZ:-UTC})"

# Periodo de gracia del healthcheck: cuenta desde el arranque hasta el primer backup
date +%s > /tmp/backup_last_ok

# BACKUP_ON_START=1 lanza un backup al arrancar (util para probar el montaje)
if [ "${BACKUP_ON_START:-0}" = "1" ]; then
  /usr/local/bin/backup.sh || true
fi

exec crond -f -l 8
