# Copias de seguridad de Supabase (#30, punto 17)

El contenedor `backup/` hace cada día un `pg_dump` de los esquemas `public` y `auth`, lo cifra con [age](https://age-encryption.org) y lo sube a Google Drive con rclone. Supabase Free no tiene PITR, así que esta es la única copia fuera de Supabase.

- **Horario:** `BACKUP_CRON` (por defecto `30 3 * * *`, zona horaria `TZ`).
- **Rotación:** copias diarias en `daily/` durante 14 días. La del día 1 de cada mes también va a `monthly/` y se guarda 400 días.
- **Avisos:** si falla, mensaje de Telegram (`TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`). Si va bien, GET opcional a `HEARTBEAT_URL` (p. ej. healthchecks.io), que avisa también si el cron deja de ejecutarse sin dar error.
- **Control de tamaño:** un volcado de menos de 10 KB se trata como fallo.
- **Cifrado:** el contenedor solo tiene la clave **pública** de age. La privada no va ni a la Raspberry ni a Drive: guárdala en el gestor de contraseñas y en una copia offline. Sin ella las copias no se pueden leer.

No incluye: archivos de Storage (la app no lo usa), roles, extensiones ni los esquemas internos de Supabase. Esos los recrea un proyecto nuevo de Supabase junto con las migraciones.

## Puesta en marcha (una vez)

En el Mac, salvo donde se indique.

1. **Par de claves age**
   ```sh
   brew install age
   age-keygen -o timetrack-backup.key   # imprime "Public key: age1..."
   ```
   Guarda `timetrack-backup.key` en el gestor de contraseñas y borra el archivo. El valor `age1...` es `AGE_RECIPIENT`.

2. **Remoto rclone de Google Drive**
   ```sh
   brew install rclone
   rclone config          # remoto nuevo "gdrive", tipo "drive", scope "drive.file"
   rclone mkdir gdrive:timetrack-backups
   base64 -i ~/.config/rclone/rclone.conf | tr -d '\n'   # valor de RCLONE_CONFIG_B64
   ```

3. **URL de la base de datos.** En Supabase → Project Settings → Database → Connection string → *Session pooler* (puerto 5432). Ese valor es `SUPABASE_DB_URL`. No uses el transaction pooler (6543): `pg_dump` no funciona con él.

4. **Imagen (arm64, para la Raspberry)**, desde la raíz del repo:
   ```sh
   docker buildx build --platform linux/arm64 -t rabadanhouse/timetrack-backup:latest --push backup/
   ```

5. **Portainer.** Añade este servicio al stack. Los valores van en las variables de entorno del stack, no en el compose:
   ```yaml
   backup:
     image: rabadanhouse/timetrack-backup:latest
     restart: unless-stopped
     environment:
       TZ: Europe/Madrid
       BACKUP_CRON: "30 3 * * *"
       SUPABASE_DB_URL: ${SUPABASE_DB_URL}
       AGE_RECIPIENT: ${AGE_RECIPIENT}
       RCLONE_REMOTE: gdrive:timetrack-backups
       RCLONE_CONFIG_B64: ${RCLONE_CONFIG_B64}
       TELEGRAM_BOT_TOKEN: ${TELEGRAM_BOT_TOKEN}
       TELEGRAM_CHAT_ID: ${TELEGRAM_CHAT_ID}
       HEARTBEAT_URL: ${HEARTBEAT_URL}
       # BACKUP_ON_START: "1"   # solo en el primer despliegue, para probarlo al momento
   ```
   Tras desplegar, comprueba en los logs que sale `[backup] OK timetrack-....dump.age` y que el archivo está en Drive. Después quita `BACKUP_ON_START`.

## Restauración

El esquema `public` ya existe en cualquier Postgres, así que `pg_restore` avisa `schema "public" already exists`. Es esperado y no afecta a nada.

**Prueba de restauración (en local, recomendable cada trimestre):**
```sh
rclone copy gdrive:timetrack-backups/daily/<archivo>.dump.age .
docker run -d --name restore-test -e POSTGRES_PASSWORD=test -p 55432:5432 postgres:17-alpine
age -d -i timetrack-backup.key <archivo>.dump.age \
  | pg_restore -d postgresql://postgres:test@localhost:55432/postgres --no-owner --no-privileges
psql postgresql://postgres:test@localhost:55432/postgres -c "select count(*) from public.access_logs"
```
Compara los recuentos con producción y borra el contenedor al terminar. El volcado descifrado contiene datos personales: no lo dejes en disco.

**Recuperación ante desastre (se pierde el proyecto de Supabase):**
1. Crea un proyecto nuevo de Supabase en eu-west-1 con Postgres 17.
2. Restaura los datos de la app:
   `age -d -i clave <archivo> | pg_restore -d "$NEW_DB_URL" --no-owner --no-privileges --schema=public`
3. Restaura usuarios y factores TOTP (en un proyecto nuevo `auth` está vacío y ya tiene su estructura):
   `age -d -i clave <archivo> | pg_restore -d "$NEW_DB_URL" --data-only --schema=auth`
4. Cambia `SUPABASE_URL` y las claves en el backend, el frontend (Dokploy) y n8n, y vuelve a desplegar.

Probado contra un Postgres 17 local (recuentos y checksums idénticos, 2026-11-04). La restauración en un proyecto real de Supabase (pasos 2–3) **todavía no se ha probado**.
