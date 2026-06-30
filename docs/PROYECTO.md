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
sábado a la tarde", "solo en Pádel Central", "quiero ese"). Pero la IA **nunca inventa
datos**: la disponibilidad, los horarios y las reservas salen de la base. La IA extrae
la intención del jugador y la app formatea los datos reales de manera determinística.
Posicionamiento: es **"el asistente de pádel del pueblo"**, no un formulario de reservas
— un asistente que hoy reserva y mañana podrá responder precios, direcciones y más.

#### El dueño carga la agenda; el dato tiene que ser verdad
Todo el producto depende de que los dueños mantengan su agenda al día en el `/admin`. Si
el bot dice "hay turno a las 18" y cuando el jugador llega estaba ocupado, se pierde al
jugador y al dueño. Por eso el panel busca que cargar disponibilidad sea lo más simple
posible, y la fuente de verdad de "qué está libre" es siempre la base, una sola.

#### Disponibilidad "pegada a la ocupación", a nivel club (no grilla fija ni por cancha aislada)
Los turnos disponibles se calculan a partir de los huecos reales entre lo ocupado (un
turno arranca donde termina la ocupación anterior), no sobre una grilla rígida anclada a
un horario fijo. Una grilla fija perdía huecos jugables reales (ej. un hueco de 19:00 a
20:30 que no caía en la grilla), y el bot decía "no hay" cuando sí había — el peor error
posible para un producto de reservas. La duración del turno es 90 min para pádel, pero
está pensada para ser configurable por deporte. Además, la grilla es **del club, no de
cada cancha por separado**: un solo barrido del día arma horarios coherentes (cada uno
con las canchas libres en ese momento) que **no se solapan entre sí**. Si se calculara
cancha por cancha, dos canchas con ocupación distinta producían horarios corridos que se
pisaban ("20:00 y 20:30" a la vez). *(El cómo del cálculo está en
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
reservar. Para cancelar, el bot exige **código + mismo teléfono del canal**: el código
identifica la reserva y el teléfono evita que alguien cancele una reserva ajena por
adivinar o probar códigos.

### Pagos (diseñado, configuración iniciada en Fase 7)

El pago es **opcional y configurable por cada club**: puede pedir 0% (solo reservar,
pagar en el lugar), 25% (una seña) o 100% (pago completo). El MVP arranca con el caso
0%: la reserva se confirma directo, sin pago online.

Desde `/ajustes`, el admin configura la política de cobro del club:
- `payment_mode='none'`: 0%, no requiere pago online.
- `payment_mode='partial'`: seña; el porcentaje vive en `deposit_pct` (ej. 25 = "1 jugador de 4").
- `payment_mode='full'`: 100% del turno.

El precio del turno vive en cada `court.price` (pesos argentinos, entero), porque distintas
canchas del mismo club pueden costar distinto. El monto a cobrar se calcula de forma
determinística: `none → 0`, `partial → price * deposit_pct / 100`, `full → price`.

El modelo es **marketplace**: cada club cobra a **su propia cuenta de Mercado Pago** (no
hay una cuenta central que recibe todo). La Fase 7 arranca por onboarding: desde
`/ajustes` el admin conecta la cuenta de Mercado Pago del club vía OAuth. Cancha usa las
credenciales de **nuestra aplicación de Mercado Pago** (`MERCADOPAGO_CLIENT_ID`,
`MERCADOPAGO_CLIENT_SECRET`, `MERCADOPAGO_OAUTH_REDIRECT_URI`) para redirigir al dueño,
recibir el `code` en `/api/mercadopago/oauth/callback` y canjearlo server-side por tokens
del vendedor.

Los tokens del club se guardan en `club_mercadopago_credentials` (server-side): `club_id`,
`mercadopago_user_id`, `access_token`, `refresh_token`, `expires_at`, `scope`,
`public_key`, `live_mode`, `connected_at`, `updated_at`. No se muestran al cliente ni se
loggean. Reconectar Mercado Pago hace upsert sobre la misma fila del club. La columna
legacy `clubs.mercadopago_access_token` fue retirada: la única fuente de verdad del token
del club es `club_mercadopago_credentials`.

El admin también puede **desvincular Mercado Pago** desde `/ajustes`. La UI exige una
confirmación explícita y avisa que el club deja de poder cobrar por el bot, que las nuevas
reservas que requieran pago no funcionarán hasta reconectar, y que las reservas ya pagadas
no se afectan porque la plata ya está en la cuenta de MP del club. Al desvincular, se borra
la fila de `club_mercadopago_credentials` y se fuerza `payment_mode='none'` /
`requires_payment=false` en la misma transacción, para que ningún club quede pidiendo pago
sin tener MP conectado.

El hold ya está introducido en el bot para clubes con `payment_mode='partial'` o `full`:
el jugador confirma → se re-chequea disponibilidad → se crea una reserva `status='pendiente'`
con `held_until = now() + 10 minutos`, `payment_status='impago'` y el monto a cobrar en
`bookings.price`. Ese hold queda bloqueando el turno porque la disponibilidad ignora solo
`cancelado`. En el siguiente paso del mismo flujo, el bot genera una preferencia de Checkout
Pro con el `access_token` del club, guarda `bookings.mp_preference_id` y manda el `init_point`
por el canal. La confirmación real del pago la hace el webhook de MP: valida firma HMAC,
consulta el pago real con el token del club, confirma solo holds vigentes y es idempotente por
`mp_payment_id`. La página de retorno `/pago/resultado` es solo visual/UX: ante retorno exitoso
de MP muestra un acuse neutro ("pago recibido, estamos confirmando") porque el webhook puede
tardar unos segundos más en acreditar la reserva. Falta liberar automáticamente holds vencidos
si no paga.

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
`phone` · `requires_payment` (legacy/sync) · `payment_mode` (`none`/`partial`/`full`) ·
`deposit_pct` · `payment_deadline_hours` · `api_key` (auth del bot) · `created_at`

### `club_mercadopago_credentials` — credenciales OAuth de MP por club
`club_id` · `mercadopago_user_id` · `access_token` · `refresh_token` · `public_key` ·
`scope` · `live_mode` · `expires_at` · `connected_at` · `updated_at`
- Una fila por club conectado. Reconectar reemplaza tokens y metadatos.
- Desvincular MP borra la fila y apaga pagos online del club (`payment_mode='none'`).
- Tokens server-side únicamente: no se devuelven en `/api/clubs/settings`, no se pasan al
  cliente y no se loggean.
- El bot usa el `access_token` de esta tabla para crear preferencias / links de pago de
  reservas con hold. Es la única fuente de verdad del token de MP del club.

### `courts` 🤖 — canchas de cada club
`id` · `club_id` · `sport_id` · `name` · `surface` · `price` (ARS) · `sort_order` · `active`

### `bookings` 🤖 — **tabla clave: ocupación y reservas**
`id` · `club_id` · `court_id` · `date` (YYYY-MM-DD) · `start_time` · `end_time` (HH:MM) ·
`type` · `status` · `customer_id` · `professor_id` · `event_id` · `recurring_rule_id` ·
`block_group_id` · `price` · `payment_status` · `held_until` · `mp_preference_id` ·
`mp_payment_id` · `payment_review_reason` · `notes` · `created_at`
- **`type`**: `simple` (reserva de jugador / del bot) · `clase` · `fijo` · `americano` ·
  `torneo` · `bloqueo` · `evento` (legacy). *(`flex` fue retirado: lo reemplazó `simple`.)*
- **`origin`**: `admin` (cargado en el panel) · `bot` (creado por el bot)
- **`status`**: `confirmado` · `pendiente` (espera pago) · `cancelado`
- **`payment_status`**: `pagado` · `senado` · `impago`
- **`held_until`**: vencimiento del hold para reservas del bot que esperan pago. Nullable:
  reservas confirmadas o sin pago no lo usan.
- **`mp_preference_id`**: id de la preferencia de Mercado Pago creada para un hold del bot.
  Nullable: reservas sin pago o confirmadas directas no lo usan.
- **`mp_payment_id`**: id del pago de Mercado Pago ya procesado para esta reserva. Único e
  idempotente: si MP reintenta el mismo webhook, no se confirma dos veces.
- **`payment_review_reason`**: motivo por el cual un pago aprobado no confirmó la reserva y
  requiere revisión manual/refund (ej. `hold_expired`, `not_pending`, `amount_mismatch`).
- **`customer_name` / `customer_phone`**: datos del cliente del bot (sin login); las
  reservas del admin pueden no tenerlos.
- **`booking_code`**: código tipo aerolínea (3 letras + 3 números, ej `HYS324`), único,
  que el bot le da al cliente para cancelar.
- **Regla de disponibilidad**: una cancha está **libre** en un rango si NO hay ningún
  booking con `status != cancelado` que se superponga (`start < rangoFin && end > rangoInicio`).
  Un hold `pendiente` ocupa igual que una confirmada hasta que se cancele o expire.
- **Presentación en agenda**: el panel del admin muestra `status='pendiente'` como
  **"Pendiente de pago" / "En espera"**, con estilo visual distinto de una reserva
  `confirmado`. Sigue ocupando la grilla porque es provisorio, no libre.
- Lo que carga el dueño en /agenda y lo que reserva el bot viven **todo acá**.

### `customers` — jugadores/clientes del club (legacy / panel)
`id` · `club_id` · `name` · `phone` · `email` · `notes` · `created_at`
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
- `GET/POST /api/clubs/settings` — datos del club, precio/modo de pago, genera `api_key`
- `POST /api/mercadopago/oauth/disconnect` — desvincula MP del club y fuerza pago online apagado
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
- **Pagos**: el onboarding OAuth de Mercado Pago conecta cada club y guarda tokens
  server-side; el bot ya usa esos tokens para crear links de pago de holds y el webhook
  confirma pagos aprobados de holds vigentes. Falta expiración automática y prueba E2E.
- **`opening_hours`**: darle UI por club (hoy se usa un default).

---

## Bot de reservas (asistente de pádel)

Bot conversacional del pueblo (MVP: Bolívar). Hoy **Telegram**; WhatsApp después.
Agnóstico al canal: la lógica vive detrás de `handleIncomingMessage(IncomingMessage)`
y los canales son adaptadores en `lib/bot/channels/`. La IA extrae intención
conversacional; las respuestas de disponibilidad se formatean de manera determinística
desde datos reales.

### Glosario
- **lugar / club**: espacio físico (ej. "Pádel Central").
- **cancha / court**: campo de juego; un lugar tiene varias.
- **turno / reserva / booking**: una fila en `bookings`.
- **booking_code**: código (3 letras + 3 números) que el bot da al cliente para cancelar.
- **origin**: `admin` (panel) o `bot` (lo creó el bot).
- **status**: `confirmado` / `pendiente` (espera pago) / `cancelado`.
- **payment_status**: `impago` / `senado` (seña) / `pagado`.
- **hold**: reserva en espera de pago (status `pendiente`). Bloquea el turno mientras el
  jugador paga por Mercado Pago o hasta que se cancele/expire.

### Módulos (`lib/bot/`)
- `memory.ts` — historial de conversación (tabla `bot_conversations`, últimos ~10 mensajes).
- `intent.ts` — `extraerIntencion` → `{ date, time, zone, club, sport }` (resuelve fechas relativas en tz BA).
- `search.ts` — `buscarDisponibilidad`: clubs del pueblo (env `BOT_CITY`; sin setear = todos) →
  si el usuario nombró un `club` concreto, filtra a ese lugar; si nombró `zone`, filtra por
  barrio/ciudad; si no, cruza todos. Reúsa `getClubAvailability`, agrupa por lugar;
  `interpretarFranja` (tarde→16:00, etc.).
- `reply.ts` — `redactarRespuesta`: enumera de forma determinística los datos reales
  recibidos (no resume ni inventa horarios).
- `extraer-reserva.ts` — `extraerAccionReserva`: decide si el usuario eligió un turno y/o dio su nombre.
- `reservar.ts` — motor: `crearReservaBot` (atómico, anti-doble-booking), `generarBookingCode`,
  `resolverTurno`, `confirmarReservaTexto`.
- `../payments/mercadopago-booking.ts` — crea preferencias de Checkout Pro para holds del bot
  usando el token del club; guarda `mp_preference_id`.
- `../mercadopago/webhook-signature.ts` — valida la firma HMAC-SHA256 de webhooks MP con
  `MERCADOPAGO_WEBHOOK_SECRET`.
- `payment-confirmation.ts` — template determinístico y envío Telegram cuando el pago acredita.
- `extraer-cancelacion.ts` — detecta si el usuario quiere cancelar y extrae/valida el
  `booking_code` sin meter lógica en adaptadores.
- `cancelar.ts` — motor de cancelación por código: busca reserva del bot, valida teléfono,
  cancela suave (`status='cancelado'`) y responde con templates determinísticos.

### Flujo de reserva del bot (Fase 6 + hold Fase 7) — end to end
1. El usuario busca y el bot ofrece turnos concretos por lugar. Si el usuario pide un
   club específico ("qué hay en Pádel Central"), el bot responde solo sobre ese club; si
   pide una zona/barrio, filtra por esa zona; si no acota, muestra la oferta cruzada.
2. El usuario elige un turno → el bot pide **nombre y apellido** ("¿A nombre de quién?").
   El **teléfono sale del canal** (Telegram: `userId`); no se pide por chat.
3. Al dar el nombre, **antes de escribir** se re-verifica que el turno siga libre (**capa B**).
4. Si sigue libre, el resultado depende de `clubs.payment_mode`:
   - `none`: crea el booking directo como antes: `type='simple'`, `origin='bot'`,
     `status='confirmado'`, `payment_status='impago'`, con `customer_name`, `customer_phone`
     y `booking_code`.
   - `partial` / `full`: crea un **hold** `type='simple'`, `origin='bot'`,
     `status='pendiente'`, `payment_status='impago'`, `held_until=now()+10min`, con el monto
     calculado en `price` (`partial`: `court.price * deposit_pct / 100`; `full`: `court.price`).
5. Para holds, el motor crea una preferencia de MP con el **access token del club**:
   `external_reference='booking:<bookingId>'`, `notification_url=/api/mercadopago/webhook`,
   `back_urls` a `/pago/resultado`, expiración alineada al hold y `marketplace_fee` calculado
   desde `PLATFORM_FEE_PCT` (0 en MVP). Guarda `mp_preference_id`.
6. El bot responde con un template determinístico. Para `none` confirma la reserva; para holds
   muestra lugar, cancha, día, hora, monto, link real de MP y avisa que tiene ~10 minutos para
   pagar o el turno se libera. Si MP falla al crear la preferencia, el hold se cancela y el bot
   avisa que no quedó reservado.

### Webhook de pago de Mercado Pago (Fase 7 Paso 5)
1. MP llama `POST /api/mercadopago/webhook?data.id=<paymentId>&booking_id=<bookingId>`; si
   `data.id` no viene en la URL, se toma de `body.data.id`. Ese valor es el id del pago, no
   el `id` de la notificación.
2. Antes de procesar, el endpoint valida `x-signature` y `x-request-id` con
   `MERCADOPAGO_WEBHOOK_SECRET`: manifest `id:<data.id>;request-id:<x-request-id>;ts:<ts>;`,
   HMAC-SHA256 y comparación en tiempo constante. Temporalmente, si falla la firma, se loguean
   `manifest`, `v1` recibido y hash calculado para diagnosticar sin exponer la secret.
3. Con `booking_id`, busca la reserva y lee el `access_token` del club desde
   `club_mercadopago_credentials` en un lookup separado (sin bloquear esa tabla); consulta el
   pago real en la API de MP con ese token.
4. Verifica que `external_reference` devuelto por MP sea `booking:<bookingId>`.
5. Solo si el pago está `approved`, la reserva sigue `status='pendiente'`, el hold no expiró
   y el monto coincide, actualiza la reserva a `status='confirmado'`. Si el modo era `partial`,
   deja `payment_status='senado'`; si era `full`, `payment_status='pagado'`.
6. La actualización se hace dentro de una transacción que bloquea la fila de `bookings`
   (`SELECT ... FOR UPDATE`) sin `LEFT JOIN` nullable a credenciales. Guarda `mp_payment_id`
   para idempotencia. Reintentos del mismo pago responden 200 sin volver a confirmar ni reenviar
   mensajes.
7. Si el pago aprobado llega tarde (`held_until` vencido), la reserva ya no está pendiente o
   el monto no coincide, NO confirma: guarda `mp_payment_id` y `payment_review_reason` para
   revisión/refund manual.
8. Si confirma, avisa al cliente por Telegram con template determinístico: lugar, cancha,
   día, hora, pago acreditado, `booking_code` y cómo cancelar.

### Flujo de cancelación del bot (Fase 6.5) — código + teléfono
1. El usuario pide cancelar y pasa su `booking_code` (ej. `HYS324`). Si no lo pasa, el bot
   lo pide; si el formato no es 3 letras + 3 números, pide el código bien.
2. El bot busca solo reservas `origin='bot'` / `type='simple'` con ese código.
3. **Regla de seguridad:** la cancelación solo procede si el código existe **y**
   `customer_phone` coincide con el `userId` del canal que escribe. Si el código no existe
   o el teléfono no coincide, el bot responde el mismo mensaje neutro ("no encontré una
   reserva con ese código") y no revela si el código era válido.
4. Si la reserva ya estaba `cancelado`, avisa que ya estaba cancelada y no escribe nada.
5. Si el turno ya empezó o quedó en el pasado según la timezone del club, no permite
   cancelarlo desde el bot.
6. Si pasa las validaciones, cancela suave: actualiza `bookings.status='cancelado'` (no
   borra la fila). Eso libera el turno porque la disponibilidad ignora bookings cancelados.
7. La confirmación al usuario es determinística e incluye código, lugar, cancha, día y hora;
   la IA no redacta datos críticos de la cancelación.

### Reglas clave
- **Disponibilidad** (`lib/bookings/availability.ts → computeAvailability`): una cancha está
  libre en un rango si NO hay booking `status<>'cancelado'` que se superponga (half-open
  `start < fin && end > inicio`). Un hold `pendiente` bloquea el turno igual que una reserva
  confirmada. La grilla es **a nivel club** (un solo barrido del día, no
  una grilla por cancha que se mezcla): turnos "pegados a la ocupación" (no grilla fija),
  **mutuamente excluyentes** (no se solapan entre sí), donde cada horario reporta las canchas
  libres en ese momento. Es **dinámica**: el cursor se re-ancla a los bordes de ocupación
  (clase termina 16:00 → primer turno 16:00; termina 16:30 → 16:30) y salta los tramos sin
  nada libre sin perder huecos reales. Duración `slotMinutes` (default 90; a futuro por deporte).
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
- Reserva del bot sin pago (`payment_mode='none'`) = **simple / bot / confirmado / impago**.
- Reserva del bot con pago (`partial`/`full`) = **simple / bot / pendiente / impago** con
  `held_until`, monto a cobrar, `mp_preference_id` y link de pago real de MP; cuando el
  webhook acredita, pasa a **confirmado / señado** o **confirmado / pagado**.
- La página `/pago/resultado` no confirma pagos ni cambia reservas; solo orienta al jugador
  después de volver de Mercado Pago. En éxito no afirma estado final de reserva: muestra que el
  pago fue recibido y que la confirmación llega por Telegram. La fuente de verdad es el webhook
  firmado de MP.
- Nombre/teléfono se guardan **en el booking** (no en `customers`): la tabla global de clientes
  queda para una etapa posterior.
- **Fase futura:** expiración automática de holds / refunds automáticos / `customers` global /
  búsqueda por distancia (lat/lng).
