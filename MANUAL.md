# Manual de Usuario — TimeTrack

TimeTrack es una plataforma de control horario y gestión de accesos. Permite registrar entradas y salidas de empleados desde la web, la app móvil o lectores físicos 2N.

---

## Roles de usuario

| Rol | Acceso |
|-----|--------|
| **Empleado** | Fichar, ver historial propio, reportes propios, incidencias |
| **Manager** | Todo lo del empleado + ver todos los fichajes, gestionar incidencias, ajustes |
| **Admin** | Todo lo del manager + gestión de empleados, API Keys, integración 2N |

---

## EMPLEADOS

### Dashboard (Inicio)

La pantalla principal muestra:
- **Botón grande central**: ficha entrada o salida con un solo clic. El sistema infiere la dirección automáticamente (si no has fichado hoy → Entrada; si tu último fichaje fue entrada → Salida).
- **Badge de estado**: "En Jornada" (verde) o "Fuera de Horario" (gris).
- **Hora actual** en tiempo real.
- **Resumen del día**: tiempo trabajado, primera entrada, última salida.
- Si tienes una pausa activa, el botón muestra "Volver de Pausa".

**¿Cómo fichar?** Pulsa el botón grande. No necesitas hacer nada más: el sistema detecta si es entrada o salida.

**¿Y si fichaje dos veces seguidas en la misma dirección?** El sistema mostrará un error de "fichaje duplicado" — es una validación de seguridad para evitar errores.

**¿Puedo fichar desde el móvil?** Sí, la app web es completamente responsive. Si se detecta geolocalización, se guarda la posición (solo para auditoría, no bloquea el fichaje).

---

### Historial

Muestra todos tus fichajes ordenados por fecha, agrupados por día.

- **Filtros**: rango de fechas, dirección (Entrada/Salida), origen (Web, Móvil, Lector).
- **Exportar**: descarga en PDF o Excel el historial del período seleccionado.
- Cada fichaje muestra: hora, dirección, tipo (Normal / Comida), origen y dispositivo.

**Tipo "Comida"**: Los fichajes realizados entre las 13:00 y las 15:59 se clasifican automáticamente como tipo "Comida".

---

### Incidencias

Permite solicitar correcciones cuando has olvidado fichar o has fichado a una hora incorrecta.

**Tipos de incidencia:**
- **Olvido**: Olvidaste fichar. Puedes indicar la hora correcta y dirección.
- **Corrección**: Fichaste a una hora incorrecta. Indica el timestamp correcto.
- **Ausencia**: Falta justificada (médico, personal).
- **Hora extra**: Horas trabajadas fuera de tu jornada habitual.

**¿Cómo crear una incidencia?**
1. Ve a "Incidencias" en el menú lateral.
2. Pulsa "Nueva Incidencia".
3. Selecciona el tipo, indica la fecha, hora y motivo.
4. Envía — quedará en estado "Pendiente" hasta que un admin/manager la revise.

**Estados de incidencia:**
- 🟡 **Pendiente**: esperando revisión.
- ✅ **Aprobada**: el admin la ha aceptado. Si era un olvido, se crea un fichaje de corrección.
- ❌ **Rechazada**: el admin la ha denegado, normalmente con una nota explicativa.

---

### Reportes

Vista de resumen mensual de tu actividad laboral.

- **Resumen**: total de horas trabajadas, días con fichaje, horas de media por día.
- **Tabla de actividad**: día a día con entradas, salidas y tiempo total.
- **Navegación por mes**: flechas para ir al mes anterior/siguiente.
- **Descargar PDF**: informe completo del mes.
- **Descargar Excel**: tabla de actividad en formato .xlsx.

---

### Mi Perfil

Edita tu información personal:
- Nombre completo, email.
- Foto de perfil.
- Activar/desactivar notificaciones por email.
- Cambiar contraseña.

---

## ADMINS Y MANAGERS

### Dashboard Admin

Visión general del estado de la empresa en tiempo real:
- **Empleados en jornada**: número de empleados actualmente dentro.
- **Total empleados**: plantilla registrada.
- **Incidencias pendientes**: solicitudes sin revisar.
- **Actividad reciente**: últimos fichajes de todos los empleados.
- **Estado por empleado**: lista de quién está dentro y quién no, con hora de entrada.

---

### Asistencia (Fichajes)

Tabla completa de todos los fichajes de la empresa.

- **Filtros**: empleado, fecha o rango de fechas, dirección.
- **Búsqueda**: por nombre o email del empleado.
- **Paginación**: 50 registros por página.
- Cada fila muestra: empleado, código, fecha/hora, dirección, tipo, origen, si tiene GPS.

---

### Empleados

Gestión de la plantilla:
- **Listar empleados**: tabla con código, nombre, email, rol, estado de sincronización con 2N.
- **Crear empleado**: formulario con nombre, email, rol (employee/manager). Se genera un código EMP-XXXX automáticamente y se crea la cuenta en Supabase Auth.
- **Editar empleado**: modificar nombre, email, rol, fechas de acceso válido.
- **Eliminar empleado**: baja definitiva.
- **Sincronizar con 2N**: si tienes integración con Access Commander, el empleado se da de alta también en el sistema de control de acceso físico.

---

### Correcciones (Incidencias Admin)

Gestión de todas las solicitudes de incidencia de los empleados.

- **Filtros**: estado (Pendiente, Aprobada, Rechazada), empleado, tipo.
- **Aprobar**: acepta la incidencia. Si es de tipo "Olvido", se crea automáticamente un fichaje de corrección con el timestamp solicitado.
- **Rechazar**: deniega la incidencia. Puedes añadir una nota explicativa para el empleado.
- **Ver detalle**: timestamp solicitado, motivo del empleado, datos del fichaje original si aplica.

---

### Reportes Admin

Similar a los reportes de empleado pero para toda la empresa:
- **Exportar por empleado**: selecciona un empleado y descarga su reporte mensual en PDF o Excel.
- **Resumen de empresa**: estadísticas agregadas del mes.

---

### Ajustes

Configuración general de la empresa, dividida en pestañas:

#### General
- Nombre de la empresa, CIF, dirección, email de contacto.

#### Sucursales
- Añadir/eliminar sedes o centros de trabajo.
- Cada sucursal puede tener sus propios festivos en el calendario laboral.

#### Control Horario
- **Geofencing**: radio en metros alrededor de la sede principal para validar fichajes GPS.
- **Minutos de cortesía**: tolerancia en minutos al inicio/fin de jornada.
- **Coordenadas de la sede**: latitud y longitud del centro principal.
- **Horario laboral**: hora de inicio y fin, días laborables de la semana.

#### Modos de Fichaje
Configura qué métodos de fichaje están disponibles:
- **Web**: botón en la aplicación web (activado por defecto).
- **Móvil**: botón en la app móvil (activado por defecto).
- **2N Access Commander**: lector físico RFID/PIN. Requiere URL del servidor AC y token API. Incluye botón "Probar conexión" e "Importar empleados desde 2N".

#### Calendario Laboral
- Gestiona festivos nacionales (afectan a toda la empresa) y locales (solo a una sucursal).
- Añade la fecha, nombre del festivo y alcance.

#### API Keys
Para integración con sistemas externos (ERP, nóminas, RRHH):
- **Crear API Key**: asigna un nombre identificativo y fecha de expiración opcional. La clave (`tt_live_...`) solo se muestra una vez al crearla — guárdala de inmediato.
- **Listar claves**: muestra el prefijo, fecha de creación, expiración y estado (Activa/Inactiva/Expirada).
- **Revocar**: elimina permanentemente la clave. Los sistemas que la usen dejarán de funcionar.

---

## Modos de fichaje explicados

| Origen | Cómo funciona | Aparece como |
|--------|---------------|--------------|
| **Web** | Botón en la app desde el navegador | "App Web" |
| **Móvil** | Botón en la app desde móvil | "App Móvil" |
| **Lector físico** | Tarjeta RFID o PIN en dispositivo 2N | "Lector Físico 2N" |
| **Corrección** | Fichaje creado al aprobar una incidencia de olvido | "Corrección" |

---

## Preguntas frecuentes

**¿Por qué no puedo fichar dos veces seguidas?**
El sistema impide dos entradas o dos salidas consecutivas para evitar errores. Si crees que hay un error, crea una incidencia de tipo "Olvido" o "Corrección".

**¿Qué pasa si olvido fichar la salida?**
Tu jornada quedará sin cerrar. Crea una incidencia de tipo "Olvido" indicando la hora de salida correcta. Un admin la revisará y, si la aprueba, se creará el fichaje automáticamente.

**¿El fichaje GPS es obligatorio?**
No. La geolocalización es opcional y solo se guarda para auditoría. No bloquea el fichaje si el empleado rechaza el permiso de ubicación.

**¿Puedo cambiar mi contraseña?**
Sí, desde Mi Perfil → Cambiar contraseña.

**¿Los festivos afectan a los reportes?**
El calendario laboral se usa como referencia para el cálculo de horas esperadas. Configúralo en Ajustes → Calendario.

**¿Cómo sé si mi incidencia fue aprobada?**
En la pantalla de Incidencias verás el estado actualizado. Si está configurado, también recibirás un email de notificación.

**¿Qué es una API Key?**
Es una credencial para que sistemas externos (como tu ERP o software de nóminas) puedan leer los fichajes de tu empresa de forma automatizada. Se crea en Ajustes → API Keys.

**¿Cómo exporto los fichajes para el software de nóminas?**
Hay dos opciones: (1) manualmente desde Reportes → Descargar Excel; (2) mediante API Key + integración automática usando el endpoint `GET /api/external/v1/fichajes`.

**¿Qué significa "EMP-0001"?**
Es el código de empleado, asignado automáticamente al crear el usuario. Es único dentro de la empresa y sirve como identificador legible para integraciones externas.

**¿Puedo tener varios administradores?**
Sí. Desde Ajustes → Empleados, puedes asignar el rol "admin" o "manager" a cualquier usuario.

**¿Los managers pueden aprobar incidencias?**
Sí, los managers tienen acceso a la gestión de incidencias y fichajes igual que los admins, pero no pueden gestionar empleados ni configurar integraciones.
