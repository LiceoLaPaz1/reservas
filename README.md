# Gestor de Reservas de Recursos

🔗 En vivo (Liceo La Paz 1): https://reservas-sand.vercel.app/
📁 La planilla con las reservas archivadas está en el Drive de POITES.

Aplicación web para reservar recursos compartidos de una institución (cañón,
TVs, salas, etc.) por fecha, turno y hora, con panel de administrador para
ver quién reservó qué y para dar de alta/baja los turnos, horas y recursos
disponibles — sin tocar código.

Pensada para que **cada institución instale su propia copia**, aislada de
las demás (no es un sistema compartido entre varias instituciones).

## Arquitectura

- Frontend: HTML + CSS + JavaScript vanilla (sin build, sin frameworks),
  servido como archivos estáticos.
- Backend: funciones serverless de Vercel bajo `/api` (un archivo = un
  endpoint), sin framework.
- Base de datos: Postgres en [Neon](https://neon.tech) (plan free alcanza).
- Login: dos roles con cuenta compartida (una para administrador, otra
  opcional de solo lectura), sesión por cookie firmada — sin base de datos
  de usuarios.
- Archivado automático (opcional): las reservas vencidas se guardan en una
  planilla de Google Sheets antes de borrarse de la base, para no perder el
  historial ni superar el límite de espacio del plan free de Neon.

## Instalación paso a paso

### 1. Cuenta de Vercel + importar el repo

1. Crear una cuenta en [vercel.com](https://vercel.com) (gratis, con GitHub).
2. Hacer un fork de este repositorio a tu propia cuenta/organización de
   GitHub.
3. En Vercel: **Add New → Project** → importar ese repo. No hace falta
   configurar ningún "Build Command" — es un proyecto estático con
   funciones serverless, Vercel lo detecta solo.

### 2. Conectar la base de datos (Neon)

1. En el proyecto de Vercel: pestaña **Storage** → **Create Database** →
   elegir **Neon** (Postgres).
2. Dejar el **"Custom Environment Variable Prefix" vacío** (sin prefijo) —
   el código espera la variable `DATABASE_URL` tal cual.
3. Conectar, marcando los entornos Production (y Preview si se quiere).

### 3. Crear las tablas

1. Abrir el proyecto de Neon recién creado en
   [console.neon.tech](https://console.neon.tech) → **SQL Editor**.
2. Copiar y ejecutar el contenido completo de [`sql/schema.sql`](sql/schema.sql).
   Esto crea las tablas y carga una semilla de ejemplo (turnos "Matutino"/
   "Vespertino" con sus horas, y algunos recursos típicos) — se puede
   editar o borrar todo después desde el panel de administrador, no hace
   falta que coincida con la realidad de tu institución.

### 4. Generar las credenciales de administrador

Necesitás tener [Node.js](https://nodejs.org) instalado en tu computadora
para este paso (una sola vez).

```bash
git clone <URL de tu fork>
cd reservas
npm install
node scripts/generar-credenciales.js <usuario> <contraseña>
```

Esto imprime 4 líneas — `ADMIN_USER`, `ADMIN_PASSWORD_HASH`,
`SESSION_SECRET` y `CRON_SECRET`. Guardalas, las necesitás en el paso
siguiente.

**Opcional — usuario de solo lectura ("lector"):** para dar acceso a
adscriptos u otro personal que solo necesite consultar y filtrar el
reporte de reservas (quién reservó qué y cuándo), sin poder editar
turnos/horas/recursos ni archivar reservas, generar credenciales aparte:

```bash
node scripts/generar-credenciales.js <usuario> <contraseña> lector
```

Esto imprime `LECTOR_USER` y `LECTOR_PASSWORD_HASH` — se cargan en Vercel
junto con las del admin (no reemplazan nada, son variables nuevas). No
generan un `SESSION_SECRET` propio: usan el mismo que ya está configurado
para el admin.

### 5. Cargar las variables de entorno en Vercel

En el proyecto de Vercel: **Settings → Environment Variables** (marcar
Production), agregar:

| Variable | Valor |
|---|---|
| `ADMIN_USER` | el usuario que elegiste |
| `ADMIN_PASSWORD_HASH` | el hash que imprimió el script |
| `SESSION_SECRET` | el valor que imprimió el script |
| `CRON_SECRET` | el valor que imprimió el script (solo hace falta si vas a usar el archivado automático del paso 7) |
| `LECTOR_USER` | (opcional) el usuario de solo lectura, si generaste uno |
| `LECTOR_PASSWORD_HASH` | (opcional) el hash correspondiente |

Después de guardarlas, ir a **Deployments** → abrir el último deployment →
**Redeploy** (las variables de entorno nuevas no aplican a deployments ya
hechos).

### 6. Probar

Abrir la URL pública del proyecto (`https://tu-proyecto.vercel.app`):
- Hacer una reserva de prueba en la pestaña "Disponibilidad".
- Entrar a la pestaña "Reportes", loguearse con el usuario/contraseña del
  paso 4, y confirmar que se ve el reporte y la reserva de prueba.
- En "Recursos y turnos" (dentro del panel de admin), personalizar los
  turnos/horas/recursos de tu institución — agregar los tuyos, borrar los
  de ejemplo que no apliquen.

### 7. (Opcional) Archivado automático a Google Sheets

Si no te preocupa el límite de espacio de la base (uso chico, pocas
reservas por año), podés saltear este paso — la app funciona igual sin
esto, solo que las reservas vencidas se van a acumular en la base para
siempre.

1. Crear una planilla nueva en [sheets.new](https://sheets.new) y copiar su
   ID (de la URL, entre `/d/` y `/edit`).
2. En [console.cloud.google.com](https://console.cloud.google.com):
   crear/elegir un proyecto → **APIs & Services → Library** → habilitar
   **Google Sheets API**.
3. **APIs & Services → Credentials → Create Credentials → Service Account**
   → crearla sin roles especiales.
4. Entrar a esa cuenta de servicio → pestaña **Keys** → **Add Key →
   Create new key → JSON** → se descarga un archivo.
5. Abrir ese archivo: copiar `client_email`, y compartir la planilla del
   paso 1 con ese email (permiso **Editor**).
6. Cargar en Vercel (Environment Variables, Production):

   | Variable | Valor |
   |---|---|
   | `GOOGLE_SERVICE_ACCOUNT_EMAIL` | el `client_email` del JSON |
   | `GOOGLE_PRIVATE_KEY` | el `private_key` del JSON, tal cual (con los `\n` literales, en una sola línea) |
   | `SHEET_ID` | el ID de la planilla del paso 1 |

7. Redeploy. El archivado corre solo, una vez al mes (configurable en
   [`vercel.json`](vercel.json), campo `schedule` — formato cron estándar).
   También hay un botón **"Archivar reservas vencidas"** en el panel de
   admin para forzarlo manualmente cuando se quiera.

## Uso diario (una vez instalada)

- **Docentes/usuarios**: no necesitan cuenta. Escriben su nombre y
  apellido, eligen fecha/turno/hora, y reservan un recurso disponible. El
  formulario no deja elegir fechas ni horas ya pasadas, y limita la
  cantidad de horas de duración al máximo real disponible según la hora
  elegida.
- **Administrador**: entra a la pestaña "Reportes" con el usuario/
  contraseña del paso 4. Ahí puede:
  - Ver el reporte de todas las reservas (quién, qué, cuándo), filtrable
    por fecha.
  - Archivar manualmente las reservas vencidas.
  - En "Recursos y turnos": agregar/eliminar turnos, agregar/eliminar
    horas dentro de cada turno, agregar/eliminar recursos y elegir en
    qué turnos está disponible cada uno — todo sin tocar código ni
    redeployar.
- **Lector** (opcional, ver paso 4): entra a la pestaña "Reportes" con su
  propio usuario/contraseña. Puede ver y filtrar el reporte de reservas,
  igual que el administrador, pero no ve la pestaña "Recursos y turnos"
  ni el botón de archivar — solo consulta.

## Licencia

CC BY-NC-SA 4.0 — Diseñada por Prof. Elizabeth Izquierdo con asistencia de
Claude.
