Stack: Next.js (App Router) + TypeScript, Supabase (Postgres/Auth/Storage), Drizzle ORM,
Inngest (jobs en background), OpenAI (ya cableado), Resend (emails), Mercado Pago Checkout Pro
(ya documentado en docs/mercado-pago.md). Tests con vitest.

Arquitectura del bot:


El bot es multi-canal. Hoy Telegram; WhatsApp se suma después.
La lógica de negocio es agnóstica al canal y vive detrás de handleIncomingMessage(IncomingMessage).
Telegram y WhatsApp son adaptadores en lib/bot/channels/ que normalizan entrada y salida.
Nada de lógica de reservas o pagos vive en un adaptador.
Hay un solo bot central (no uno por club). La búsqueda cruza todos los clubs filtrando por zona/barrio.
El cobro es por club: cada club cobra a su propia cuenta de MP (clubs.mercadopago_access_token).


Tablas relevantes (Supabase):


clubs (id, name, timezone, neighborhood, phone, requires_payment, payment_deadline_hours, mercadopago_access_token, api_key, ...)
courts (id, club_id, sport_id, name, surface, active, ...)
bookings (id, club_id, court_id, date, start_time, end_time, type, status, customer_id, price, payment_status, notes, created_at)

status: confirmado | pendiente | cancelado
payment_status: pagado | senado | impago



customers (id, club_id, name, phone, email, ...)
notifications (id, club_id, customer_id, booking_id, channel, kind, status, ...)


Regla de negocio clave: una cancha está libre en una franja si NO existe ningún booking
con status != 'cancelado' que se superponga en (court_id, date, [start_time, end_time)).

Reglas de seguridad (no negociables):


El service_role de Supabase y los mercadopago_access_token viven SOLO en el servidor. Nunca al cliente.
Cada webhook valida su secreto/firma antes de procesar (Telegram: header X-Telegram-Bot-Api-Secret-Token; WhatsApp: firma X-Hub-Signature-256; MP: firma + idempotencia).
Las entradas externas (webhooks, mensajes) se validan antes de usarse.
Las horas se manejan en la timezone del club.


Definición de terminado (aplica a TODA fase): una fase no está completa hasta que:
compila sin errores de TS ni lint; tiene tests con vitest que cubren el camino feliz y los bordes;
los secretos viven solo server-side; las entradas externas se validan; y no se tocan archivos
ni tablas fuera del alcance de la fase actual.

- Migraciones de Drizzle: correr SIEMPRE por DIRECT_URL (session pooler, puerto 5432, sin pgbouncer).
- Runtime de la app (lib/db): usa DATABASE_URL (transaction pooler, puerto 6543, pgbouncer=true).
- Nunca mezclar: no migrar por el pooler (el DDL como CREATE EXTENSION / constraints EXCLUDE falla),
  ni correr el runtime por la conexión directa.
- DIRECT_URL vive solo en .env.local, nunca en Vercel ni en código de runtime.