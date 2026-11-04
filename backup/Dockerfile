FROM postgres:17-alpine

RUN apk add --no-cache age rclone tzdata curl

COPY backup.sh /usr/local/bin/backup.sh
COPY entrypoint.sh /usr/local/bin/entrypoint.sh
RUN chmod +x /usr/local/bin/backup.sh /usr/local/bin/entrypoint.sh

# Portainer lo muestra como unhealthy si no hay backup correcto en BACKUP_MAX_AGE_H horas
HEALTHCHECK --interval=15m --timeout=10s --start-period=1m \
  CMD [ $(( $(date +%s) - $(cat /tmp/backup_last_ok 2>/dev/null || echo 0) )) -lt $(( ${BACKUP_MAX_AGE_H:-26} * 3600 )) ]

ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]
