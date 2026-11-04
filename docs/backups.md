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
   base64 -i ~/.config/rclone/rclone.conf | tr -d '\n' | pbcopy   # valor de RCLONE_CONFIG_B64
   ```
   Pega el portapapeles en Portainer **sin copiar nada entre medias**; si se cuela otra cosa, el backup falla con "RCLONE_CONFIG_B64 no es un base64 valido".

   **Client_id propio (obligatorio).** El client_id compartido de rclone se retira durante 2026. En producción se usa uno propio, en el proyecto de Google Cloud `rclone-timetrack`:
   - Google Drive API habilitada.
   - Google Auth Platform: público *Externo* y estado **En producción**. En modo *Prueba*, el token caduca a los 7 días. Para poder publicar hay que rellenar *Desarrollo de la marca* sin logotipo.
   - Cliente OAuth de tipo *Aplicación de escritorio*; el ID y el secreto están en Contraseñas.
   - En el Mac: `rclone config update gdrive client_id ... client_secret ...`, que también reautoriza en el navegador.

   Con `drive.file`, cada cliente OAuth solo ve los archivos que creó él. Si se cambia de client_id, la carpeta antigua deja de verse desde rclone y hay que volver a crearla: `rclone mkdir gdrive:timetrack-backups`. La carpeta del cliente compartido se renombró a `timetrack-backups-antiguo` en Drive.

   Si el token se filtra: myaccount.google.com/connections → *rclone timetrack* → quitar acceso, después `rclone config reconnect gdrive:` (navegador `y`) y actualizar `RCLONE_CONFIG_B64`.

3. **URL de la base de datos.** En Supabase → botón **Connect** → *Session pooler* (puerto 5432). Ese valor es `SUPABASE_DB_URL`:
   `postgresql://postgres.bflflqxwndzewnrxmohd:<contraseña>@aws-1-eu-west-1.pooler.supabase.com:5432/postgres`
   - No uses *Direct connection* (`db.<ref>.supabase.co`): solo va por IPv6 y la Raspberry no la alcanza.
   - No uses el *transaction pooler* (6543): `pg_dump` no funciona con él.
   - La contraseña es la **de la base de datos**, no la de la cuenta de Supabase. Si tiene caracteres especiales, codifícala con `python3 -c "import urllib.parse,getpass;print(urllib.parse.quote(getpass.getpass('pass: '), safe=''))"`.

4. **Imagen (arm64, para la Raspberry)**, desde la raíz del repo:
   ```sh
   docker buildx build --platform linux/arm64 -t rabadanhouse/timetrack-backup:latest --push backup/
   ```

5. **Telegram.** Bot propio `@timetrack_backups_rabadan_bot` (token en Contraseñas). `TELEGRAM_CHAT_ID` = `5021464912`. Hay que haber pulsado *Iniciar* en el bot para que pueda escribir; el bot no contesta nunca a mensajes, y eso es lo normal.

6. **Portainer.** El servicio `backup` está en el stack `n8n` (contenedor `n8n-backup-1`). Los valores van en las variables de entorno del stack, no en el compose:
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
       BACKUP_MAX_AGE_H: "26"
       # BACKUP_ON_START: "1"   # solo en el primer despliegue, para probarlo al momento
   ```
   Tras desplegar, comprueba en los logs que sale `[backup] OK timetrack-....dump.age` y que el archivo está en Drive. Después quita `BACKUP_ON_START`.

## Gestión desde Portainer

- **Estado:** el contenedor tiene healthcheck. Aparece *healthy* mientras el último backup correcto tenga menos de `BACKUP_MAX_AGE_H` horas (26 por defecto) y *unhealthy* si no. Tras arrancar cuenta como recién hecho, así que el primer aviso llega 26 h después si el cron falla.
- **Logs:** Containers → `backup` → Logs. Cada ejecución deja `[backup] ... pg_dump...` y `[backup] OK ...` o `[backup] ERROR: ...`.
- **Backup manual:** Containers → `n8n-backup-1` → Console → Command **`/bin/sh`** (la imagen es Alpine, no tiene bash) → `backup.sh`.
- **Comprobar una variable sin mostrarla:** en la consola, `printf '%s' "$RCLONE_CONFIG_B64" | wc -c` (su longitud debe coincidir con la del Mac).
- **Cambiar horario, rotación o destino:** edita las variables del stack (`BACKUP_CRON`, `KEEP_DAILY_DAYS`, `KEEP_MONTHLY_DAYS`, `RCLONE_REMOTE`...) y pulsa *Update the stack*.
- **Nueva versión de la imagen:** igual que con el backend, *Update the stack* con re-pull no siempre recrea el contenedor. Usa Containers → `backup` → *Recreate* con "Re-pull image" y comprueba que cambia el Id del contenedor.

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
