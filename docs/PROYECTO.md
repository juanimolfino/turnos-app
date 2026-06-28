# Cancha — Documentación del proyecto

> Estado: MVP en desarrollo. Este documento describe cómo funciona el proyecto **hoy**.

Cancha es un sistema de gestión de turnos para canchas de pádel. Cada **club** (lugar)
tiene un **admin** que gestiona su agenda; un **superadmin** administra los clubs y
los admins. Un **bot conversacional** (hoy Telegram, WhatsApp después; con OpenAI)
usa la misma base para que los jugadores busquen y reserven turnos. Ver
[§ Bot de reservas](#bot-de-reservas-asistente-de-pádel).

---

## Visión y decisiones de producto

> Esta sección explica el **por qué** del proyecto: la visión y las decisiones de
> negocio. El resto del documento explica el **qué** y el **cómo**. Los términos y el
> detalle técnico (glosario, reglas de disponibilidad, anti-doble-booking, `origin`,
> `payment_status`, `booking_code`, `hold`) ya están en
> [§ Bot de reservas](#bot-de-reservas-asistente-de-pádel) y en §5 — acá va solo la
> intención, sin repetirlos.

### Qué problema resuelve

Hoy, en un pueblo, un jugador que quiere reservar una cancha de pádel tiene que
escribirle por WhatsApp a cada lugar, uno por uno, preguntando horarios y precios.
Es lento, disperso, y no hay forma de ver "todo lo disponible" de un vistazo.

Cancha centraliza eso: **toda la oferta de pádel del pueblo en un solo lugar**. El
jugador le pregunta a un único bot ("quiero jugar el sábado a la tarde"), y el bot le
muestra la disponibilidad real de **todos los lugares** cruzados, deja elegir, y
reserva. Del otro lado, cada dueño gestiona su agenda desde un panel `/admin`, y esa
agenda es la que alimenta lo que el bot ofrece.

El MVP arranca en **Bolívar** (Buenos Aires, ~30.000 habitantes, 8-10 lugares de
pádel), porque es un mercado chico y abarcable donde se puede probar el producto y el
cambio de hábito de cerca.

### Las decisiones de producto y su porqué

#### Un solo bot central, no uno por club
El valor del producto es que el jugador **pregunta una vez y ve todo**. Si hubiera un
bot por club, se perdería justamente eso: el jugador tendría que hablar con varios bots,
igual que hoy habla con varios WhatsApp. Por eso hay **un único número/bot**, y la
búsqueda cruza todos los lugares. El club aparece en los resultados, no en "a quién le
escribiste".

#### El bot es un canal, la lógica de negocio no le pertenece
El bot es un medio para acceder a la información; la inteligencia de reservas, pagos y
disponibilidad vive en la app, no en el bot. Esto permite que mañana el mismo "cerebro"
sirva a WhatsApp, a una app, o a lo que venga, sin reescribir nada. Por eso la
arquitectura separa **canal** (Telegram/WhatsApp, adaptadores) de **cerebro** (la lógica,
agnóstica al canal).

#### Telegram primero, WhatsApp después
WhatsApp (Meta Cloud API) requiere verificación de negocio, número provisionado, tokens
permanentes y aprobación de plantillas: lento y burocrático. Telegram se configura en
minutos. Como la lógica es agnóstica al canal, se construye y prueba todo sobre Telegram
hoy, y sumar WhatsApp después es agregar un adaptador, sin tocar el cerebro ya probado.

#### La IA es para que sea humano, no para que decida
El bot usa un modelo de lenguaje para **conversar de forma natural** (entender "el
sábado a la tarde", redactar como un asistente del pueblo). Pero la IA **nunca inventa
datos**: la disponibilidad, los horarios y las reservas salen de la base, y la IA solo
los expresa en palabras. Posicionamiento: es **"el asistente de pádel del pueblo"**, no
un formulario de reservas — un asistente que hoy reserva y mañana podrá responder
precios, direcciones y más.

#### El dueño carga la agenda; el dato tiene que ser verdad
Todo el producto depende de que los dueños mantengan su agenda al día en el `/admin`. Si
el bot dice "hay turno a las 18" y cuando el jugador llega estaba ocupado, se pierde al
jugador y al dueño. Por eso el panel busca que cargar disponibilidad sea lo más simple
posible, y la fuente de verdad de "qué está libre" es siempre la base, una sola.

#### Disponibilidad "pegada a la ocupación", no grilla fija
Los turnos disponibles se calculan a partir de los huecos reales entre lo ocupado (un
turno arranca donde termina la ocupación anterior), no sobre una grilla rígida anclada a
un horario fijo. Una grilla fija perdía huecos jugables reales (ej. un hueco de 19:00 a
20:30 que no caía en la grilla), y el bot decía "no hay" cuando sí había — el peor error
posible para un producto de reservas. La duración del turno es 90 min para pádel, pero
está pensada para ser configurable por deporte. *(El cómo del cálculo está en
[§ Bot de reservas](#bot-de-reservas-asistente-de-pádel) y §5.)*

#### El jugador no tiene login; se identifica por teléfono + nombre
Nadie hace login para reservar: le escribe a un bot. El teléfono sale del canal
(Telegram/WhatsApp lo proveen) y el nombre se pide una vez. Para el MVP, nombre y
teléfono se guardan **en la reserva misma**. Una tabla global de clientes (para clientes
frecuentes, preferencias, marketing) queda para una etapa posterior — pero el dato se
captura desde ahora, para no perderlo.

#### Reserva automática, sin aprobación del dueño
Cuando el jugador reserva, queda reservado: el dueño **ve** la reserva, no la **aprueba**.
La reserva impacta directo en la misma agenda que el dueño usa, así que aparece en su
panel como cualquier otro turno, marcada con `origin: bot` para distinguir que vino del
asistente y no la cargó él.

#### El anti-doble-booking es sagrado (dos capas)
Que dos jugadores reserven el mismo turno es el error más caro: se pierde a los dos y al
dueño queda mal. Por eso hay dos defensas: una capa de software que chequea antes de
escribir y maneja el caso con un mensaje amable, y una **constraint a nivel base de datos
que hace físicamente imposible** que existan dos reservas solapadas, aunque el código
fallara. La primera da buena experiencia; la segunda da garantía de hierro. *(El detalle
técnico de las dos capas está en [§ Bot de reservas](#bot-de-reservas-asistente-de-pádel).)*

#### El código de reserva tipo aerolínea
Como no hay login, el jugador necesita una forma de identificar **su** reserva para
cancelarla sin que otro pueda. Se le da un código corto tipo vuelo (`HYS324`) al
reservar. Ese código es la prueba de que la reserva es suya.

### Pagos (diseñado, se implementa en una fase posterior)

El pago es **opcional y configurable por cada club**: puede pedir 0% (solo reservar,
pagar en el lugar), 25% (una seña) o 100% (pago completo). El MVP arranca con el caso
0%: la reserva se confirma directo, sin pago online.

Cuando se sume el pago, el modelo es **marketplace**: cada club cobra a **su propia
cuenta de Mercado Pago** (no hay una cuenta central que recibe todo). El flujo será:
el jugador confirma → se re-chequea disponibilidad → la reserva pasa a **hold** (queda
bloqueada para los demás) → se genera el link de pago de MP de ese club → si paga dentro
de ~10 minutos, el webhook confirma la reserva; si no, el hold expira y el turno se
libera. El estado de pago se refleja en `payment_status`: `impago` / `senado` (seña) /
`pagado`.

La plataforma podrá cobrar una **comisión configurable por club** (un *marketplace fee*),
manejada desde la cuenta de superadmin. En el MVP arranca en 0%, pero la lógica se diseña
para soportarlo desde el inicio, sin rehacer el flujo de pago después.

### Hacia dónde escala (visión, no construido)

El modelo de datos y la arquitectura se diseñan para no cerrar estas puertas, aunque hoy
no se construyan:

- **Otros deportes:** el mismo bot, con el deporte como un filtro más ("quiero jugar al
  fútbol"), no un bot por deporte. Las tablas ya contemplan `sport`; el día que entre
  otro deporte, no hay que rehacer la lógica, solo cargar las canchas.
- **Otras ciudades:** hoy en Bolívar el bot busca en todos los clubs (un solo pueblo).
  Para escalar a varias ciudades, el filtro de ciudad ya existe (configurable, hoy
  desactivado). A más largo plazo, la forma robusta de ubicar al jugador es por
  **coordenadas/distancia** (que comparta su ubicación por el chat), no por jerarquía
  administrativa (provincia/ciudad/barrio), que se vuelve inmanejable entre países. Se
  prevé sumar `lat`/`lng` a los clubs.
- **Banear jugadores problemáticos:** a futuro, que un dueño pueda bloquear a un teléfono
  que reserva y no se presenta. Pensado como baneo **por lugar** (no global, para que un
  solo dueño no expulse a alguien de toda la plataforma) y con visibilidad del superadmin.
- **El bot como asistente completo:** además de reservar, responder precios, direcciones,
  y otras consultas comunes del pueblo.

### Modelo de negocio (abierto, por decisión consciente)

Todavía no está definido cómo monetiza la plataforma, y es a propósito: el primer desafío
no es cobrar, es el **cambio cultural** — convencer a 8-10 dueños de adoptar un panel y
mantener su agenda al día. La estrategia es entrar accesible, generar la necesidad, y
recién después introducir un modelo de cobro. Las opciones contempladas (sin decidir):
suscripción de los clubs por usar el panel, o comisión por reserva (el *marketplace fee*
ya previsto en el diseño de pagos). El diseño no cierra ninguno de los dos caminos.

### Principios que guían el proyecto

- **Una sola fuente de verdad:** la lógica de disponibilidad, las etiquetas, las reglas —
  cada cosa vive en un solo lugar y todos la consumen (el bot, el panel). Evita que dos
  partes del sistema "no coincidan".
- **Decisiones baratas que no cierran puertas:** preparar el terreno para escalar cuando
  es barato (capturar el teléfono, dejar el deporte como filtro, contemplar la comisión en
  0%), sin construir la complejidad completa antes de necesitarla.
- **El dato crítico es ruidoso, no silencioso:** en memoria de conversación, un fallo puede
  degradar en silencio (mejor un bot sin memoria que caído). Pero en reservas y pagos, un
  fallo tiene que ser explícito, nunca tragado.
- **Fase por fase, con criterio de "terminado":** cada cambio es chico, testeado y revisado
  antes de avanzar. Lo crítico e irreversible (reservas, constraints, dinero) se revisa con
  más cuidado que lo cosmético.

---

## 1. Stack

- **Next.js 16** (App Router, Turbopack) + React 19
- **TypeScript**, estilos **inline** (no Tailwind para la UI principal)
- **Supabase**: Auth (usuarios admin) + Postgres
- **Drizzle ORM** (`lib/db/schema.ts`, migraciones en `drizzle/`)
- **Resend** (emails), **MercadoPago** (pagos opcionales), **Vercel** (deploy)
- Zona horaria de referencia: `America/Argentina/Buenos_Aires`

Variables de entorno en `.env.local` (Supabase, DATABASE_URL, Resend, MercadoPago, etc.).

---

## 2. Roles y flujo de usuarios

### Roles
- **superadmin**: ve y administra todos los clubs y admins. No tiene club propio.
- **admin**: dueño/encargado de un club. Gestiona su agenda, canchas y ajustes.

### Flujo de alta de un admin (invitación)
1. El **superadmin** invita un email desde su panel (`/superadmin/admins`).
   - `POST /api/admin/invite` → usa `inviteUserByEmail` de Supabase.
   - Si el email ya existe en Auth **sin confirmar** (invitación vieja), se borra y se
     reinvita limpio. Si ya está confirmado, se rechaza (409).
   - El nombre de la cancha es **opcional** acá (lo puede poner el admin después).
2. El invitado recibe un mail y entra a `/invite/callback` (componente cliente que
   maneja los 3 formatos de Supabase: PKCE `?code=`, OTP `?token_hash=`, e implícito
   `#access_token=`). Autentica y redirige a `/set-password`.
3. En **`/set-password`** el admin crea su **contraseña** y el **nombre de su cancha**.
   - Recién acá se crea el registro en la tabla `users` (`POST /api/auth/onboarding`)
     y se crea/asocia el `club`. **Un usuario "existe" en la DB solo cuando completa
     su cuenta**, no al hacer click en el mail.
4. Queda logueado y entra al panel del club.

> Archivos clave: `app/api/admin/invite/route.ts`, `app/(auth)/invite/callback/page.tsx`,
> `app/(auth)/set-password/`, `app/api/auth/onboarding/route.ts`,
> `lib/db/queries.ts` (`ensureUserProfile`, `setOnboardingClubName`, `deleteDbUserByEmail`).

---

## 3. Estructura de rutas

```
app/
  (marketing)/         landing pública + /pricing
  (auth)/              login, invite/callback, set-password, logout, callback
  (app)/               panel del ADMIN (requiere club)
    dashboard/         "Agenda del día"
    agenda/            "Agenda semanal" (carga de bloques)
    estadisticas/
    ajustes/           Mi Club, clases, fijos, eventos
  (superadmin)/        panel del SUPERADMIN (clubs, admins, resumen)
  api/                 endpoints (ver sección 6 y 7)
```

El layout `(app)` muestra el **Sidebar** (escritorio) o barra superior + nav inferior
(mobile), con accesos: Agenda del día · Agenda semanal · Ajustes · Estadísticas.

---

## 4. Canchas, Agenda semanal y Agenda del día

### Canchas
- El admin define **cuántas canchas tiene** en `/agenda` (crea `Cancha 1..N`, deporte
  Pádel por defecto). Se pueden renombrar y cambiar la cantidad (bajar la cantidad
  **no borra historial**: desactiva las sobrantes).
- `GET/POST/PATCH /api/courts` (`getClubCourts`, `setClubCourtCount`, `renameCourt`).

### Agenda semanal (`/agenda`) — donde se carga la información
- Grilla **por cancha** (pestañas) × **horarios**, navegable por semana.
- Botón **+ Nuevo bloque** (o tocar una celda libre). El editor permite:
  - **Tipo**: `simple` (Reservado) · `clase` · `fijo` · `americano` · `torneo` · `bloqueo` (cerrado)
  - **Canchas**: una, varias o **Todas**
  - **Días** de la semana (multi-selección)
  - **Horario** desde/hasta (cada 30 min)
  - **Nota** opcional (profe, grupo, quién juega…)
  - ☑ **Repetir el resto del mes** → replica el bloque en las semanas siguientes del mes
- Tocar un bloque existente → **Editar** (reabre el editor precargado) o **Quitar**
  (solo esa celda, o toda la serie/grupo).
- **Cómo se guarda**: cada bloque es una fila en `bookings` (ver sección 5). Un bloque
  aplicado a varias canchas/días comparte un `block_group_id` para poder editarlo o
  borrarlo en conjunto. Al crear, se borran primero los bloques superpuestos del mismo
  rango (nunca reservas `simple` de jugadores).
- `POST/DELETE /api/agenda/block` (`createAgendaBlocks`, `deleteAgendaBlock`,
  `deleteAgendaBlockGroup`).

### Agenda del día (`/dashboard`) — visualización
- Se arma con los **mismos `bookings`** de la agenda semanal, para el día elegido.
- Formato: columna **Disponibilidad** (semáforo: Todas libres / X libres / Completo),
  franjas según los bordes de los bloques, y **estado por celda** (Libre · Reservado ·
  Clase · Turno fijo · Americano · Torneo · Cerrado).
- **Banda unificada** cuando un bloque abarca todas las canchas.
- **Línea de "ahora"** posicionada a la hora real dentro de la franja, y lo ya
  transcurrido del día **atenuado**.
- Navegación por día y filtro por cancha.

> La fecha/hora se calculan en la **zona horaria del club** (`lib/tz.ts`,
> `todayInTz`/`nowInTz`), no en UTC ni en el reloj del navegador.

---

## 5. Modelo de datos (tablas Supabase)

Marcadas con 🤖 las que consume/escribe el **bot**.

### `clubs` 🤖 — cada lugar/cancha
`id` · `name` · `timezone` · `plan` · `address` · `city` · `neighborhood` (barrio/zona) ·
`phone` · `requires_payment` (bool) · `payment_deadline_hours` · `mercadopago_access_token` ·
`api_key` (auth del bot) · `created_at`

### `courts` 🤖 — canchas de cada club
`id` · `club_id` · `sport_id` · `name` · `surface` · `sort_order` · `active`

### `bookings` 🤖 — **tabla clave: ocupación y reservas**
`id` · `club_id` · `court_id` · `date` (YYYY-MM-DD) · `start_time` · `end_time` (HH:MM) ·
`type` · `status` · `customer_id` · `professor_id` · `event_id` · `recurring_rule_id` ·
`block_group_id` · `price` · `payment_status` · `notes` · `created_at`
- **`type`**: `simple` (reserva de jugador / del bot) · `clase` · `fijo` · `americano` ·
  `torneo` · `bloqueo` · `evento` (legacy). *(`flex` fue retirado: lo reemplazó `simple`.)*
- **`origin`**: `admin` (cargado en el panel) · `bot` (creado por el bot)
- **`status`**: `confirmado` · `pendiente` (espera pago) · `cancelado`
- **`payment_status`**: `pagado` · `senado` · `impago`
- **`customer_name` / `customer_phone`**: datos del cliente del bot (sin login); las
  reservas del admin pueden no tenerlos.
- **`booking_code`**: código tipo aerolínea (3 letras + 3 números, ej `HYS324`), único,
  que el bot le da al cliente para cancelar.
- **Regla de disponibilidad**: una cancha está **libre** en un rango si NO hay ningún
  booking con `status != cancelado` que se superponga (`start < rangoFin && end > rangoInicio`).
- Lo que carga el dueño en /agenda y lo que reserva el bot viven **todo acá**.

### `customers` — jugadores/clientes del club (legacy / panel)
`id` · `club_id` · `name` · `phone` · `email` · `notes` · `created_at`
- La usa el endpoint **legacy** `/api/public/bookings` (find-or-create por teléfono).
- **El bot NO usa esta tabla:** guarda `customer_name`/`customer_phone` directo en el
  `booking`. La tabla global de clientes queda para una **etapa futura**.

### `professors` — profes de clases
`id` · `club_id` · `name` · `active`

### `sports` — deporte (hoy solo Pádel)
`id` · `name` · `slug`

### `opening_hours` — horario de apertura por día (opcional)
`id` · `club_id` · `weekday` (0=Lun…6=Dom) · `open_time` · `close_time` · `slot_minutes`
> Hoy casi no se usa. La disponibilidad del bot usa esto **si existe**, si no un default
> (08:00–23:00, slots de 90 min).

### `recurring_rules` — reglas recurrentes (clase/fijo)
`id` · `club_id` · `type` · `court_id` · `customer_id` · `professor_id` · `weekday` ·
`start_time` · `end_time` · `valid_from` · `valid_until` · `active` · `notes`
> /agenda genera `bookings` concretos en vez de depender de esta tabla.

### `events` — americanos/torneos/clínicas con inscripción
`id` · `club_id` · `name` · `kind` · `date` · `start_time` · `end_time` · `court_ids[]` ·
`category` · `price_per_player` · `capacity` · `registered_count` · `status` · `signup_link`

### `notifications` — avisos a clientes
`id` · `club_id` · `customer_id` · `booking_id` · `channel` (whatsapp/email) · `kind` ·
`status` · `sent_at`

### `users` — admins y superadmin (NO los jugadores)
`id` · `auth_user_id` (Supabase) · `email` · `full_name` · `role` (admin/superadmin) ·
`venue_name` · `club_id` · `created_at`

### Legacy (ignorar) — del boilerplate SaaS, no se usan en Cancha
`credits` · `subscriptions` · `jobs` · `transactions`

---

## 6. API pública (lo que consume el bot)

Autenticación: header `x-api-key: <club.api_key>` (o `?api_key=`). La disponibilidad
también acepta búsqueda por ciudad o sin filtro.

### Ver disponibilidad
```
GET /api/public/availability?date=YYYY-MM-DD[&api_key=...][&city=...][&start=HH:MM][&end=HH:MM][&slot=90]
```
- `api_key` → un club · `city` → varios (ilike) · sin filtro → todos.
- Calcula: ventana horaria del club (opening_hours si existe, si no 08:00–23:00, slot 90)
  menos los `bookings` no cancelados.
- Respuesta:
```json
{ "clubs": [ {
  "club": { "id","name","city","neighborhood","address","phone","requiresPayment" },
  "date": "2026-06-23",
  "openingWindow": { "open":"08:00","close":"23:00","slotMinutes":90 },
  "availableSlots": [ { "start":"20:00","end":"21:30",
      "freeCourts":[{"id","name"}], "totalCourts":3 } ]
} ] }
```

### Reservar un turno
```
POST /api/public/bookings   (header x-api-key)
body: { courtId, date, startTime, endTime, customerName, customerPhone, notes? }
```
- (Endpoint **legacy**) Crea/encuentra un `customer` por teléfono e inserta un `booking`
  `type: "simple"`. **Ojo:** el **bot** (`lib/bot/reservar.ts`) NO usa este endpoint ni la
  tabla `customers` — guarda `customer_name`/`customer_phone` directo en el booking.
- Si el club tiene `requires_payment`: queda `status: "pendiente"` y, si hay token de
  MercadoPago, devuelve `paymentUrl`. Si no, `status: "confirmado"`.

### Confirmar pago
```
GET /api/public/bookings/[id]/confirm   (callback de MercadoPago)
```

> El modelo es consistente: las reservas de jugadores son `bookings` `type: simple`;
> los bloques del dueño son los otros `type`. El bot trabaja con
> `clubs → courts → bookings` (no usa `customers`: guarda nombre/teléfono en el booking).

---

## 7. Endpoints internos (panel admin/superadmin)

- `POST /api/admin/invite` — invitar admin/superadmin
- `POST /api/auth/onboarding` — crea perfil + nombre de cancha (set-password)
- `POST /api/auth/ensure-profile` — crea perfil para superadmin
- `GET/POST/PATCH /api/courts` — canchas
- `POST/DELETE /api/agenda/block` — bloques de agenda
- `GET/POST /api/clubs/settings` — datos del club, genera `api_key`
- `GET /api/superadmin/clubs` — listado para el panel

---

## 8. Scripts útiles

```bash
# Limpiar datos de prueba (deja solo superadmin + admin reales)
node --env-file=.env.local scripts/cleanup-db.mjs

# Cargar 3 clubs DEMO con una semana de bloques (para simular el bot)
node --env-file=.env.local scripts/seed-demo.mjs
node --env-file=.env.local scripts/seed-demo.mjs --clean   # borrarlos

# Migraciones
npm run db:generate   # genera SQL desde schema.ts
npm run db:migrate    # aplica las migraciones por DIRECT_URL (conexión directa, puerto 5432)
# Las migraciones corren por DIRECT_URL, NO por el pooler (DATABASE_URL, 6543): el DDL
# (CREATE EXTENSION, constraints EXCLUDE) falla a través de pgbouncer. El runtime de la
# app sí usa DATABASE_URL (pooler). DIRECT_URL vive solo en .env.local.
```

Clubs DEMO que crea el seed (api_key entre paréntesis):
- **Pádel del Centro** — Rosario/Centro, 3 canchas, sin pago (`ck_demo_centro`)
- **La Esquina Pádel** — Rosario/Pichincha, 2 canchas, con pago (`ck_demo_esquina`)
- **Norte Pádel Club** — Funes, 4 canchas, sin pago (`ck_demo_norte`)

---

## 9. Pendientes / ideas a futuro

- **Búsqueda por zona en ciudades grandes**: hoy se filtra por `city`; el barrio
  (`neighborhood`) sirve como zona. Mejor evolución: agregar `lat`/`lng` al club y
  ordenar por **distancia real** a la ubicación que comparte el jugador por WhatsApp.
- **Pagos**: el flujo MercadoPago está armado pero requiere token por club y prueba E2E.
- **`opening_hours`**: darle UI por club (hoy se usa un default).

---

## Bot de reservas (asistente de pádel)

Bot conversacional del pueblo (MVP: Bolívar). Hoy **Telegram**; WhatsApp después.
Agnóstico al canal: la lógica vive detrás de `handleIncomingMessage(IncomingMessage)`
y los canales son adaptadores en `lib/bot/channels/`. Redacción con OpenAI.

### Glosario
- **lugar / club**: espacio físico (ej. "Pádel Central").
- **cancha / court**: campo de juego; un lugar tiene varias.
- **turno / reserva / booking**: una fila en `bookings`.
- **booking_code**: código (3 letras + 3 números) que el bot da al cliente para cancelar.
- **origin**: `admin` (panel) o `bot` (lo creó el bot).
- **status**: `confirmado` / `pendiente` (espera pago) / `cancelado`.
- **payment_status**: `impago` / `senado` (seña) / `pagado`.
- **hold**: reserva en espera de pago (status `pendiente`). Concepto para Fase 7; hoy no se usa.

### Módulos (`lib/bot/`)
- `memory.ts` — historial de conversación (tabla `bot_conversations`, últimos ~10 mensajes).
- `intent.ts` — `extraerIntencion` → `{ date, time, zone, sport }` (resuelve fechas relativas en tz BA).
- `search.ts` — `buscarDisponibilidad`: clubs del pueblo (env `BOT_CITY`; sin setear = todos) →
  reúsa `getClubAvailability`, agrupa por lugar; `interpretarFranja` (tarde→16:00, etc.).
- `reply.ts` — `redactarRespuesta`: la IA redacta **solo sobre los datos reales** (no inventa horarios).
- `extraer-reserva.ts` — `extraerAccionReserva`: decide si el usuario eligió un turno y/o dio su nombre.
- `reservar.ts` — motor: `crearReservaBot` (atómico, anti-doble-booking), `generarBookingCode`,
  `resolverTurno`, `confirmarReservaTexto`.

### Flujo de reserva del bot (Fase 6) — end to end
1. El usuario busca y el bot ofrece turnos concretos por lugar (búsqueda ya existente).
2. El usuario elige un turno → el bot pide **nombre y apellido** ("¿A nombre de quién?").
   El **teléfono sale del canal** (Telegram: `userId`); no se pide por chat.
3. Al dar el nombre, **antes de escribir** se re-verifica que el turno siga libre (**capa B**).
4. Si sigue libre, se crea el booking: `type='simple'`, `origin='bot'`, `status='confirmado'`,
   `payment_status='impago'` (el club del MVP requiere **0% de pago**), con `customer_name`,
   `customer_phone` y un `booking_code` único.
5. El bot confirma con lugar, cancha, día, hora y el **código** (guardar para cancelar).

### Reglas clave
- **Disponibilidad**: una cancha está libre en un rango si NO hay booking `status<>'cancelado'`
  que se superponga (half-open `start < fin && end > inicio`). Turnos "pegados a la ocupación"
  (no grilla fija), duración `slotMinutes` (default 90).
- **Anti-doble-booking en DOS capas:**
  - **Capa B (software):** re-chequeo de solapamiento antes de insertar. Mensaje amable si se ocupó.
  - **Capa A (base, garantía de hierro):** constraint `EXCLUDE USING gist` sobre `court_id` +
    un rango temporal `tsrange` (extensión `btree_gist`), con `WHERE status <> 'cancelado'`.
    El rango se arma con una función `booking_tsrange(date,start,end)` marcada `IMMUTABLE`
    (el cast text→timestamp es STABLE; al ser strings ISO de formato fijo es determinístico,
    y así se puede usar en la expresión del índice sin columna generada). Ante una carrera
    concurrente, Postgres rechaza la 2ª inserción (`23P01`) y el motor la traduce a
    `SLOT_NO_DISPONIBLE`. Una cancelada NO bloquea (coherente con la regla de disponibilidad).

### Decisiones y alcance
- Reserva del bot = **simple / bot / confirmado / impago** (MVP 0% de pago).
- La creación está modelada para que en **Fase 7** se inserte un paso de **hold** (esperando
  pago) sin reescribir la firma ni el manejo de errores (documentado en `crearReservaBot`).
- Nombre/teléfono se guardan **en el booking** (no en `customers`): la tabla global de clientes
  queda para una etapa posterior.
- **Fase futura (NO en Fase 6):** pago / link de MercadoPago / hold con expiración / cancelación
  por código / `customers` global / búsqueda por distancia (lat/lng).
