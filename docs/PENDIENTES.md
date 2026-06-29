# Pendientes — Cancha

> Backlog de cosas postergadas conscientemente durante el desarrollo del MVP.
> No son bugs ni cosas rotas: son decisiones de "esto va después" para no agrandar el
> alcance de cada fase. Cada una tiene contexto de POR QUÉ se postergó, para retomarla
> sin reconstruir la decisión.
>
> Estado del proyecto al momento de escribir esto: MVP funcional de punta a punta
> (el bot busca disponibilidad, reserva con anti-doble-booking, y cancela con código).
> Falta la fase de pagos (fase 7) y los pendientes de abajo.

---

## Producto / UX del bot

### Sacar el barrio (neighborhood) de la redacción del bot
El bot a veces dice "Pádel Central, barrio Belgrano". En el MVP (un solo pueblo) el barrio
no aporta y además delata datos de otras ciudades. Decisión tomada: no mostrar neighborhood
en la redacción. Pendiente: limpiarlo en `lib/bot/reply.ts`. Es chico.

### Elegir cancha al reservar
Hoy el bot ofrece por horario (grilla del club) y al reservar asigna una cancha libre. Pero
algunas canchas no son iguales (una techada, otra no; una "más fea"). Cuando hay varias libres
a una hora, el usuario podría querer elegir. Pendiente: ofrecer la elección de cancha al
reservar SOLO cuando haya más de una libre. Nota: la solución de "elegí cancha 1 o 2" no
convence del todo (ver pendiente siguiente, que es la mejor versión de esto).

### Metadata / prioridad de canchas
Idea mejor que "elegí cancha 1 o 2": que el club marque cada cancha con atributos —ej.
"estrella" (la mejor), "sin techo", "con vidrio", "no deseada"— y una prioridad de reserva.
Así el bot elige por el cliente ("te reservo la mejor que queda libre") o avisa con contexto
("a esa hora solo queda una sin techo, ¿te sirve?"), en vez de hacerlo elegir por número.
Pendiente: definir campos en `courts` (ej. `priority`, `tags`/atributos) y usarlos en la
selección de cancha y en la redacción. Es una mejora, no MVP.

---

## Panel del admin

### UI para editar opening_hours desde el panel
Hoy el horario de apertura de cada club (`opening_hours`) NO se puede editar desde el panel;
si no hay filas, la disponibilidad cae a un default (08:00–23:00, slot 90). Es información que
el dueño tiene que poder cargar, porque define cuándo su cancha está disponible. Pendiente:
construir la UI en el panel para editar opening_hours por club/día. Importante para que el dato
que lee el bot sea correcto cuando un club no abre 08–23.

### Normalizar horas de cierre en el panel
El selector de horario del panel ofrecía "24:00" como fin (medianoche), que no es una hora
válida. Ya se parcheó normalizando 24:00 → 23:59 al guardar. Pendiente menor: revisar que el
selector no ofrezca valores fuera de rango y que la representación de "hasta medianoche" sea
consistente en toda la UI.

---

## Seguridad / robustez

### Rate limit anti-fuerza-bruta en el webhook
El booking_code (3 letras + 3 números) es adivinable. Hoy la cancelación está protegida porque
además exige que el teléfono coincida (casi imposible de adivinar + tener el teléfono de la
víctima), así que el riesgo real es bajo. Pero no hay límite de intentos. Pendiente: rate limit
por `channel:userId` (y/o IP del webhook) + alerta/logging ante muchos "NO_ENCONTRADA"
consecutivos. Va en una fase de endurecimiento, sobre todo antes de abrir a público amplio.

---

## Escalabilidad (etapa 2 — no MVP)

### Tabla de clientes (customers) global
Hoy el bot guarda nombre y teléfono DIRECTO en el booking, sin usar la tabla `customers`
(que es por club). Decisión: el cliente del bot es del pueblo, no de un club, y el MVP no
necesita un sistema de clientes. Pendiente (etapa 2): clientes frecuentes, preferencias,
historial, marketing personalizado. El dato (nombre/teléfono) YA se captura desde ahora en
cada reserva, así que no se pierde nada — solo falta la capa que lo aproveche.

### Búsqueda por distancia (lat/lng) para varias ciudades
Hoy en Bolívar el bot busca en todos los clubs (un pueblo). El filtro por ciudad existe
(env `BOT_CITY`, hoy desactivado). Para escalar a varias ciudades, la forma robusta es ubicar
al jugador por coordenadas/distancia (que comparta su ubicación por el chat), no por jerarquía
administrativa (provincia/ciudad/barrio), que se vuelve inmanejable entre países. Pendiente:
agregar `lat`/`lng` a los clubs (cargados en el onboarding) y ordenar por distancia real.

### Banear jugadores problemáticos
A futuro: que un dueño pueda bloquear a un teléfono que reserva y no se presenta. Diseño
pensado: baneo POR LUGAR (no global, para que un solo dueño no expulse a alguien de toda la
plataforma) y con visibilidad del superadmin. Pendiente: tabla tipo `blocked_customers`
(club_id, phone, motivo, fecha) y chequeo al reservar.

### El bot como asistente completo
Hoy el bot reserva y cancela. La visión es que sea "el asistente de pádel del pueblo": que
también responda precios, direcciones, "¿alquilan paletas?", etc. Pendiente: diseñar un paso
de routing de intención (¿reservar / cancelar / consultar?) y las capacidades nuevas.

### Migrar a WhatsApp
Hoy el canal es Telegram. La arquitectura es agnóstica al canal (cerebro detrás de
`handleIncomingMessage`, canales como adaptadores en `lib/bot/channels/`). Pendiente: sumar
el adaptador de WhatsApp (Meta Cloud API) — un archivo nuevo en channels/ + la ruta del
webhook, SIN tocar el cerebro. Requiere el trámite de Meta (verificación de negocio, número,
token permanente, plantillas para mensajes proactivos).

---

## Próxima fase grande

### Fase 7 — Pagos (Mercado Pago, marketplace)
Onboarding OAuth del club: hecho en el Paso 1. Configuración de precio/modo de pago y
desvinculación de Mercado Pago: hecho en el Paso 2. Cada club puede conectar/reconectar su cuenta
de Mercado Pago desde `/ajustes`; los tokens quedan server-side en `club_mercadopago_credentials`.
El precio vive por cancha (`courts.price`) y el modo vive por club (`clubs.payment_mode` /
`clubs.deposit_pct`). Al desvincular MP, el club queda automáticamente en `payment_mode='none'`.
Hold del bot para clubes con pago: hecho en el Paso 3. La reserva queda `pendiente`, con
`held_until` y monto calculado, y bloquea el turno.
Link de pago del bot: hecho en el Paso 4. Para holds, el bot crea una preferencia de Checkout Pro
con el token del club, guarda `mp_preference_id` y manda el link al jugador.
Webhook de confirmación: hecho en el Paso 5. Valida firma HMAC, consulta el pago real con el token
del club, confirma solo holds vigentes y guarda `mp_payment_id` para idempotencia.

Pendiente de la fase grande: expiración automática de holds vencidos, comisión de plataforma
configurable desde superadmin (hoy 0%), prueba E2E y cancelación CON refund (política 24/48hs).
Se planifica paso a paso por ser la parte que toca dinero.

### Refund automático de pagos tardíos
Si un pago llega aprobado después de que el hold expiró, el webhook NO confirma la reserva y deja
`payment_review_reason='hold_expired'` para revisión manual. Pendiente: automatizar el refund en MP
para estos casos y notificar claramente al cliente/admin cuando ocurra.

### UI superadmin para marketplace fee
La lógica de comisión ya existe vía `PLATFORM_FEE_PCT` y arranca en 0 para el MVP. Pendiente:
construir una UI de superadmin para configurar esa comisión sin tocar variables de entorno, y
decidir si será global o por club antes de abrir pagos reales a escala.



### Refresh automático del token de Mercado Pago
El access_token de MP que se guarda al conectar un club vence a los 180 días (6 meses). Hoy NO hay
lógica que lo renueve usando el refresh_token (que sí se guarda). Sin esto, los pagos de un club
dejan de funcionar de golpe a los 6 meses de haberse conectado, sin aviso. Pendiente: implementar
la renovación automática del token (usar el refresh_token para pedir uno nuevo antes/cuando vence,
y actualizar club_mercadopago_credentials). Prioridad: media — no urgente (hay 6 meses), pero es
una bomba de tiempo silenciosa si se olvida.

### Robustecer la asociación club↔cuenta de MP en el OAuth
Hoy, al volver del OAuth de MP, el club se resuelve desde la sesión del admin logueado (no desde el
state, que solo valida CSRF). Funciona bien en el caso normal, pero si la sesión se perdiera durante
el flujo (admin tardó mucho, otra pestaña, etc.) el callback podría fallar o asociar mal. Pendiente:
vigilar este caso cuando haya varios clubs conectando en paralelo; evaluar codificar el club de forma
segura en el flujo en vez de depender solo de la sesión. Prioridad: baja para el MVP (un club a la
vez), revisar antes de escalar.


### Notificación de nueva reserva en el panel del admin
Cuando entra una reserva nueva (del bot) mientras el admin tiene la agenda abierta, hoy no se
entera hasta que refresca. Idea: un aviso/toast tipo "Cayó una nueva reserva, actualizá para verla"
(o que se actualice sola). Aplica a reservas confirmadas y a holds que se confirman. Evaluar
implementación: polling simple cada X segundos, o realtime (Supabase Realtime). Prioridad: media —
mejora de UX para el dueño, no bloquea el circuito de pagos. Va después de cerrar pagos.
