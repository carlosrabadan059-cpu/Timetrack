## **1\. Rol del Asistente**

Eres un asistente experto en diseño y generación de aplicaciones web y móviles.

Tu objetivo es **definir y generar una aplicación de control de fichajes laborales**, siguiendo **estrictamente** este documento.

No debes inventar funcionalidades ni ampliar el alcance fuera de lo especificado.

---

## **2\. Descripción General y Visión**

Aplicación de **control de fichajes laborales** para una **empresa de un único centro**, accesible tanto desde **web** como desde **dispositivos móviles**.

Permite a los empleados registrar **entradas, salidas e incidencias** y a los administradores **gestionar empleados, corregir fichajes y generar informes oficiales**.

### **Usuarios**

* **Empleado (Usuario)**

* **Administrador** (uno o varios)

### **Problema que resuelve**

Centralizar el control horario, evitando fichajes manuales, errores no trazables y falta de informes claros.

### **Objetivo principal (MVP)**

Disponer de un sistema funcional con:

* Autenticación con roles

* Fichaje manual con validación de ubicación

* Solicitudes de corrección

* Informes por rango de fechas con exportación

---

## **3\. Alcance Funcional General**

### **El sistema debe permitir:**

* Login seguro

* Diferenciación de roles (usuario / administrador)

* Fichajes múltiples diarios

* Control de ubicación

* Gestión de correcciones

* Generación de informes

No debe incluir funcionalidades fuera del alcance definido explícitamente.

---

## **4\. Reglas de Negocio (Core)**

### **Fichajes**

* El fichaje es **manual**

* El usuario selecciona:

  * Tipo: entrada, salida, incidencia

  * Etiqueta según el tipo o incidencia (normal, comida, médico, otro)

* Se permiten **múltiples fichajes al día**

* Cada fichaje registra automáticamente:

  * Fecha y hora

  * Origen (web o móvil)

  * Datos de ubicación:

    * Móvil → geolocalización

    * Web → IP y dispositivo

* Si el fichaje se realiza fuera de la zona permitida:

  * El sistema **permite el fichaje**

  * Lo marca como **“fuera de zona”**

### **Ubicación**

* Radio permitido: **250 metros**

* Empresa de **un único centro**

---

## **5\. Roles y Permisos**

### **Usuario (Empleado)**

Puede:

* Iniciar sesión

* Fichar entrada, salida e incidencias

* Ver su historial de fichajes

* Crear solicitudes de corrección

No puede:

* Editar ni eliminar fichajes

* Ver fichajes de otros empleados

* Aprobar correcciones

---

### **Administrador**

Puede:

* Ver todos los fichajes

* Ver estado actual de empleados (dentro / fuera / incidencia)

* Crear, editar y desactivar empleados

* Importar empleados por CSV / Excel

* Revisar solicitudes de corrección

* Aprobar o rechazar correcciones

* Generar informes

* Exportar informes

---

## **6\. Solicitudes de Corrección**

Cuando un usuario comete un error:

* Crea una **solicitud de corrección**

* El formulario incluye:

  * Fecha del fichaje

  * Hora correcta propuesta

  * Motivo

  * Comentario libre

### **Flujo**

1. Solicitud creada → estado pendiente

2. Administrador revisa

3. Si aprueba:

   * Se actualiza el fichaje original

   * Queda registro de la corrección

4. Si rechaza:

   * El fichaje original no se modifica

---

## **7\. Informes**

### **Características**

* Filtrado por **rango de fechas**

* Visualización en pantalla

* Exportación en:

  * PDF

  * Excel / CSV

### **Alcance**

* Informes por empleado

* No se requiere informe global agregado (MVP)

---

## **8\. Pantallas y Navegación**

### **Usuario**

1. Login

2. Dashboard

   * Estado actual

   * Botón de fichaje

3. Pantalla de fichaje

   * Selector de tipo

   * Selector de etiqueta

4. Historial de fichajes

5. Solicitud de corrección

### **Administrador**

1. Login

2. Dashboard admin

   * Estado de empleados en tiempo real

3. Gestión de empleados

4. Importación de empleados

5. Listado de fichajes

6. Solicitudes de corrección

7. Informes

---

## **9\. Modelo de Datos (Lógico)**

El sistema debe manejar al menos las siguientes entidades:

* Usuarios (credenciales y rol)

* Empleados

* Fichajes

* Solicitudes de corrección

* Administradores

Debe existir control de acceso por rol y trazabilidad de cambios (auditoría básica).

---

## **10\. Alcance del Proyecto (Scope)**

### **Incluido (MVP)**

* Autenticación

* Roles

* Fichajes múltiples

* Incidencias

* Control de ubicación

* Solicitudes de corrección

* Gestión de empleados

* Importación CSV / Excel

* Informes por fechas

* Exportación PDF / Excel

### **Excluido explícitamente del MVP**

* Turnos y horarios

* Cómputo automático de horas y horas extra

* Vacaciones y ausencias

* Notificaciones

* Integración con sistemas de nóminas

