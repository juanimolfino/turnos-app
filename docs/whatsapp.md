# WhatsApp y Bot Multi-Canal

Estado al `2026-07-20`: Telegram y WhatsApp estan activos como canales del mismo bot central. La logica de negocio sigue siendo una sola y vive en `handleIncomingMessage(IncomingMessage)`.

## Objetivo

- Mantener un solo cerebro para busqueda, reserva, pago y cancelacion.
- Tratar Telegram y WhatsApp como adaptadores de entrada/salida.
- Guardar identidad y trazabilidad por canal sin mezclar secretos en cliente.
- Detectar incidentes de cobro o confirmacion antes de que pasen desapercibidos.

## Arquitectura actual

### Adaptadores

- `lib/bot/channels/telegram.ts`
- `lib/bot/channels/whatsapp.ts`

Cada adaptador solo sabe enviar mensajes. No contiene logica de reservas ni pagos.

### Punto de entrada del bot

- `lib/bot/handle.ts`

El bot recibe:

- `channel`
- `userId`
- `text`

Con eso:

1. carga historial,
2. detecta intencion,
3. busca disponibilidad real,
4. pide datos si faltan,
5. reserva o cancela,
6. responde por el adaptador del canal.

## Webhook de WhatsApp

Ruta:

- `/api/whatsapp/webhook`

Comportamiento:

1. `GET` valida la suscripcion de Meta con `WHATSAPP_VERIFY_TOKEN`.
2. `POST` valida `X-Hub-Signature-256` usando `WHATSAPP_APP_SECRET`.
3. Si llega un `messages` de texto:
   - `channel = "whatsapp"`
   - `userId = message.from`
   - `text = message.text.body`
4. El webhook delega en `handleIncomingMessage(...)`.
5. Si falla el procesamiento interno, devuelve `200` igual para evitar loops de reintento de Meta. El error queda en logs.

Se ignoran:

- `statuses`
- mensajes no-texto

## Identidad y datos guardados

### Telegram

- `channel = "telegram"`
- `channelUserId = chat.id`
- `customers.phone` se pide por conversacion
- `bookings.customerPhone` guarda el id del canal para seguridad de cancelacion

### WhatsApp

- `channel = "whatsapp"`
- `channelUserId = message.from`
- `customers.phone = message.from`
- `bookings.customerPhone = message.from`

Esto implica que hoy la misma persona puede existir como dos identidades distintas si hablo por Telegram y por WhatsApp. Es intencional mientras ambos canales conviven.

## Flujo de reserva por WhatsApp

### Captura de datos

WhatsApp ya entrega el numero del usuario, asi que el bot no pide telefono.

Si el usuario elige un turno y todavia no se identifico, el bot pregunta:

> ¿A nombre de quien hago la reserva? Pasame nombre y apellido.

### Persistencia

Al reservar por WhatsApp:

- `customerName` sale del chat
- `customerContactPhone` usa `message.from`
- `channel = whatsapp`
- `channelUserId = message.from`

## Flujo de pago

### Reserva con pago

Si el club usa `payment_mode = partial` o `full`:

1. el bot crea un hold `pendiente`,
2. bloquea el turno,
3. genera preferencia de Mercado Pago,
4. manda link de pago por el mismo canal.

### Confirmacion del pago

Ruta:

- `/api/mercadopago/webhook`

Comportamiento actual:

1. valida firma del webhook de Mercado Pago,
2. trae el pago real con el token del club,
3. confirma el hold solo si el pago esta aprobado y el hold sigue vigente,
4. manda mensaje de confirmacion al mismo canal donde nacio la reserva.

La confirmacion post-pago ya no esta hardcodeada a Telegram. Usa:

- `customer.channel`
- `customer.channel_user_id`

Si faltan esos datos en una reserva vieja, hay fallback a Telegram.

## Incidentes y guardrails agregados

### Problema que ya se corrigio

Se detecto un fallo donde el webhook de Mercado Pago devolvia `500` por una query con `LEFT JOIN customers` junto a `FOR UPDATE`. Eso impedia confirmar y avisar correctamente.

Correccion aplicada:

- la query bloqueante ahora hace `FOR UPDATE` solo sobre `bookings` y joins no-nullables,
- la identidad del cliente se lee despues en una segunda consulta dentro de la misma transaccion.

### Alertas de revision

Se agrego una alerta in-app para duenos de club cuando pasa alguno de estos casos:

- el pago fue aprobado pero la reserva no se pudo confirmar,
- la reserva se confirmo pero fallo el aviso al cliente.

Tipo de alerta:

- `pago_requiere_revision`

Esto evita depender solo de logs de Vercel.

### Incidentes operativos para superadmin

Se agrego una segunda capa de observabilidad para superadmin:

- tabla `operational_incidents`,
- vista `/superadmin/incidentes`,
- boton `Analizar pagos` para crear reportes desde una auditoria manual.

La tabla guarda incidentes internos aunque el webhook responda `200` a Mercado Pago. Casos cubiertos:

- `booking_missing`: el webhook apunta a una reserva inexistente,
- `missing_mercadopago_credentials`: no se puede consultar el pago por falta de credenciales del club,
- `reference_mismatch`: el pago no coincide con la reserva esperada,
- `approved_payment_not_confirmed`: Mercado Pago aprobo el pago, pero la reserva no quedo confirmada,
- `customer_notification_failed`: la reserva quedo confirmada, pero fallo el aviso final al cliente,
- `webhook_processing_error`: error inesperado durante el procesamiento del webhook.

La vista permite ver club, cliente, canal, codigo de reserva, payment id, estado de reserva/pago y severidad. Si el cliente viene de WhatsApp se marca con badge `WhatsApp`.

## Cancelaciones

### Cancelacion desde el bot

El cliente cancela con:

- codigo de reserva
- mismo telefono/canal de origen

### Politica de devolucion

Si la politica del club no devuelve dinero:

1. el bot no cancela de inmediato,
2. avisa que no habra devolucion,
3. pide confirmacion explicita.

Texto esperado:

> Podes cancelar tu reserva ..., pero por la politica de ... no se realiza la devolucion del dinero. Si queres cancelarla igual, responde: `confirmo CODIGO`

### Notificacion in-app de cancelacion

Cuando una cancelacion del bot se concreta, ahora se crea una alerta in-app:

- `cancelacion_reserva`

Eso permite que el dueno vea la cancelacion en la campana sin depender de revisar manualmente la agenda.

## Notificaciones del panel

Campana:

- `components/layout/notification-bell.tsx`
- `GET/POST /api/notifications`

Estado actual:

- polling bajado de `45s` a `120s`
- toasts para novedades
- nuevos tipos visuales:
  - `nueva_reserva`
  - `cancelacion_reserva`
  - `pago_requiere_revision`
- cuando entra una notificacion nueva, la app ejecuta `router.refresh()`

Efecto practico:

- si el dueno esta mirando `/agenda`, la vista se actualiza cuando entra una nueva reserva o una cancelacion detectada por la campana

## Inngest

Uso actual relevante:

- `expire-bot-holds`
- `refresh-mercadopago-tokens`
- jobs AI

Ajuste aplicado:

- `expire-bot-holds` paso de cada `5` minutos a cada `15` minutos

Motivo:

- bajar consumo para no empujar al plan pago sin necesidad

Tradeoff:

- un hold vencido puede tardar hasta 15 minutos en liberarse si nadie interactua

## Variables de entorno relevantes

### WhatsApp

- `WHATSAPP_VERIFY_TOKEN`
- `WHATSAPP_APP_SECRET`
- `WHATSAPP_ACCESS_TOKEN`
- `WHATSAPP_PHONE_NUMBER_ID`

### Mercado Pago

- credenciales de app para OAuth del onboarding
- credenciales por club guardadas server-side

Regla:

- nunca exponer estos valores al cliente
- nunca usar `NEXT_PUBLIC_` para secretos

## Migraciones aplicadas

Se agregaron valores al enum `admin_notification_kind`:

- `cancelacion_reserva`
- `pago_requiere_revision`

Migraciones:

- `drizzle/0027_next_jack_power.sql`
- `drizzle/0028_boring_solo.sql`
- `drizzle/0029_medical_zarek.sql`

Aplicadas con `DIRECT_URL` en local, no con `DATABASE_URL`.

## Checklist operativo

### Reserva por WhatsApp

1. escribir al numero del bot,
2. pedir disponibilidad,
3. elegir turno,
4. verificar que pida solo nombre y apellido,
5. reservar,
6. verificar que la agenda muestre la reserva.

### Pago

1. recibir link de pago,
2. pagar,
3. verificar que la reserva quede `confirmado`,
4. verificar que llegue el mensaje final por WhatsApp,
5. si falla la confirmacion o el aviso, verificar alerta `pago_requiere_revision` en campana,
6. entrar a `/superadmin/incidentes` y revisar si se creo un incidente critico,
7. usar `Analizar pagos` si se quiere correr una auditoria manual de pagos inconsistentes.

### Cancelacion

1. cancelar por codigo,
2. si no corresponde devolucion, verificar pregunta de confirmacion,
3. confirmar,
4. verificar mensaje final al cliente,
5. verificar alerta `cancelacion_reserva` en campana,
6. verificar que la agenda se refresque.

## Limitaciones vigentes

- no hay soporte todavia para audio, imagen o botones de WhatsApp
- no se unifican identidades Telegram/WhatsApp
- el refresh de agenda depende hoy de polling de la campana y `router.refresh()`, no de tiempo real puro
- fuera de la ventana de 24 horas de WhatsApp se necesitaran templates aprobados

## Archivos clave

- `app/api/whatsapp/webhook/route.ts`
- `app/api/mercadopago/webhook/route.ts`
- `lib/bot/handle.ts`
- `lib/bot/payment-confirmation.ts`
- `lib/bot/cancelar.ts`
- `lib/db/queries.ts`
- `components/layout/notification-bell.tsx`
- `lib/inngest/functions.ts`
