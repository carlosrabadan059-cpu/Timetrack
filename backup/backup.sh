#!/bin/sh
# pg_dump de Supabase -> cifrado con age -> Google Drive (rclone) con rotacion.
#
# Variables obligatorias:
#   SUPABASE_DB_URL      postgresql://postgres.<ref>:<password>@aws-0-eu-west-1.pooler.supabase.com:5432/postgres
#   AGE_RECIPIENT        clave publica age (age1...). La privada NO vive en este contenedor.
#   RCLONE_REMOTE        remoto rclone y carpeta, p. ej. gdrive:timetrack-backups
#   RCLONE_CONFIG_B64    contenido de rclone.conf en base64 (o montar /config/rclone/rclone.conf)
# Opcionales:
#   KEEP_DAILY_DAYS (14), KEEP_MONTHLY_DAYS (400)
#   TELEGRAM_BOT_TOKEN y TELEGRAM_CHAT_ID: aviso si falla
#   HEARTBEAT_URL: URL que se llama (GET) tras cada backup correcto, p. ej. healthchecks.io,
#                  para enterarse tambien si el cron deja de ejecutarse
set -eu
set -o pipefail

: "${KEEP_DAILY_DAYS:=14}"
: "${KEEP_MONTHLY_DAYS:=400}"

notify_fail() {
  echo "[backup] ERROR: $1"
  if [ -n "${TELEGRAM_BOT_TOKEN:-}" ] && [ -n "${TELEGRAM_CHAT_ID:-}" ]; then
    curl -s -m 20 "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage" \
      --data-urlencode "chat_id=${TELEGRAM_CHAT_ID}" \
      --data-urlencode "text=TimeTrack backup FALLO: $1" >/dev/null || true
  fi
  exit 1
}

for v in SUPABASE_DB_URL AGE_RECIPIENT RCLONE_REMOTE; do
  eval "val=\${$v:-}"
  [ -n "$val" ] || notify_fail "falta la variable $v"
done

if [ -n "${RCLONE_CONFIG_B64:-}" ]; then
  mkdir -p /root/.config/rclone
  echo "$RCLONE_CONFIG_B64" | base64 -d > /root/.config/rclone/rclone.conf
fi

STAMP="$(date +%Y%m%d-%H%M%S)"
DAY="$(date +%d)"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT
FILE="timetrack-${STAMP}.dump.age"

echo "[backup] ${STAMP} pg_dump..."
# Esquemas con datos de la app y de autenticacion (usuarios y factores TOTP).
pg_dump "$SUPABASE_DB_URL" -Fc --no-owner --no-privileges \
  --schema=public --schema=auth \
  | age -r "$AGE_RECIPIENT" -o "$WORK/$FILE" \
  || notify_fail "pg_dump o cifrado fallido"

SIZE="$(wc -c < "$WORK/$FILE")"
# Un dump vacio o ridiculo indica fallo silencioso (p. ej. conexion cortada)
[ "$SIZE" -gt 10000 ] || notify_fail "volcado sospechosamente pequeno (${SIZE} bytes)"

rclone copyto "$WORK/$FILE" "${RCLONE_REMOTE}/daily/${FILE}" || notify_fail "subida a Drive fallida"

# El dia 1 de cada mes se conserva una copia mensual
if [ "$DAY" = "01" ]; then
  rclone copyto "$WORK/$FILE" "${RCLONE_REMOTE}/monthly/${FILE}" || notify_fail "subida mensual fallida"
fi

rclone mkdir "${RCLONE_REMOTE}/monthly" || true
rclone delete "${RCLONE_REMOTE}/daily" --min-age "${KEEP_DAILY_DAYS}d" || true
rclone delete "${RCLONE_REMOTE}/monthly" --min-age "${KEEP_MONTHLY_DAYS}d" || true

echo "[backup] OK ${FILE} (${SIZE} bytes)"
if [ -n "${HEARTBEAT_URL:-}" ]; then
  curl -fsS -m 20 --retry 3 "$HEARTBEAT_URL" >/dev/null || echo "[backup] aviso: heartbeat fallido"
fi
