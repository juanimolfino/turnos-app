FASE 6 — Reservar de verdad (con anti-doble-booking). Esta es la fase más delicada del proyecto:
el bot pasa a ESCRIBIR reservas en la base. Leé todo antes de empezar y respetá el alcance.

═══ CONTEXTO DE NEGOCIO (no inventar, respetar) ═══
- El bot es un asistente de pádel del pueblo (Bolívar). Hoy busca disponibilidad y ahora va a
  poder reservar.
- Identidad del cliente: SIN login. El teléfono sale del canal (Telegram: userId). El nombre y
  apellido se piden por chat. NO se pide teléfono.
- Pago: es OPCIONAL y configurable por club (0% / 25% / 100%). En ESTA fase implementamos SOLO el
  caso 0% (no requiere pago). Los casos 25%/100% (link de MP, expiración de hold) son fase 7 y NO
  se construyen ahora, pero el diseño debe dejarles lugar.
- Vocabulario: "lugar"/"club" = espacio físico (ej "Pádel Central"); "cancha"/"court" = campo de
  juego; "turno"/"reserva" = booking. Una reserva del bot es type='simple', origin='bot'.

═══ ALCANCE DE ESTA FASE ═══
HACER: el bot toma una reserva — pide nombre y apellido, verifica disponibilidad de forma atómica,
crea el booking, genera un código de reserva y se lo da al usuario.
NO HACER (fases futuras, no tocar ahora): pago / link de MP / hold con expiración de 10 min /
cancelación / job de Inngest. Si algo de esto aparece, es fuera de alcance.

═══ FLUJO DEL BOT ═══
1. El usuario eligió un turno (lugar + cancha + día + hora) en el flujo de búsqueda ya existente.
2. El bot pide nombre y apellido ("¿A nombre de quién hago la reserva?").
3. Al confirmar, ANTES de escribir: re-verificá que el turno SIGUE libre (chequeo de software,
   "capa B"). Si ya no está libre → mensaje amable ("uy, ese turno se acaba de ocupar, te muestro
   otras opciones") y volvé a la búsqueda. NO intentes escribir.
4. Si sigue libre → creá la reserva (ver siguiente bloque). El club del MVP requiere 0% de pago,
   así que la reserva se crea directamente como status='confirmado', payment_status='impago'.
   Conceptualmente la reserva pasa por "hold" e inmediatamente a confirmado porque no hay pago que
   esperar; en el código, modelá la creación de forma que cuando en fase 7 haya pago, se pueda
   insertar un paso intermedio (hold esperando pago) SIN reescribir esto. Documentá ese punto.
5. Confirmá al usuario con: lugar, cancha, día, hora, y el CÓDIGO DE RESERVA. Decile que guarde el
   código para cancelar (la cancelación se habilita en la próxima fase).

═══ DATOS DE LA RESERVA (campos del booking que crea el bot) ═══
- type='simple', origin='bot', status='confirmado', payment_status='impago'
- club_id, court_id, date, start_time, end_time del turno elegido
- Nombre+apellido y teléfono del cliente: guardalos EN el booking (campos en la tabla, no en
  customers — la tabla customers global queda pendiente para etapa 2, NO la uses ni la crees ahora).
  Si bookings no tiene campos para nombre/teléfono del cliente del bot, agregalos en la migración
  (ej. customer_name, customer_phone, nullable, porque las reservas del admin pueden no tenerlos).
- booking_code: código único tipo aerolínea, 3 letras + 3 números (ej "HYS324"). Generalo al crear.
  Debe ser ÚNICO en la tabla (columna con unique). Si por casualidad se repite, reintentá la
  generación. Letras mayúsculas sin caracteres ambiguos si querés (evitar O/0, I/1 es deseable).

═══ ANTI-DOBLE-BOOKING (lo más importante de la fase — DOS CAPAS) ═══
El problema: dos usuarios pueden confirmar el MISMO turno casi simultáneamente. "Verificar libre"
y "escribir" son dos pasos; en la rendija entre ambos se puede colar un doble-booking. Dos defensas:

CAPA B (software, primera línea, experiencia amable): el chequeo del paso 3 del flujo. Maneja el
99% de los casos con un mensaje lindo. Pero NO es suficiente solo, porque dos confirmaciones en el
mismo milisegundo pueden pasar ambas el chequeo antes de que cualquiera escriba.

CAPA A (constraint de base de datos, última línea, garantía de hierro): una constraint EXCLUDE en
Postgres que hace FÍSICAMENTE IMPOSIBLE que existan dos bookings no cancelados solapados en la
misma cancha. Aunque el código B fallara, la base rechaza la segunda inserción. Implementación:

  - La tabla bookings hoy guarda date (text 'YYYY-MM-DD'), start_time y end_time (text 'HH:MM')
    por separado. La constraint EXCLUDE necesita un RANGO temporal para detectar solapamiento.
  - Activá la extensión btree_gist (CREATE EXTENSION IF NOT EXISTS btree_gist).
  - Construí un rango a partir de date + start_time y date + end_time. Recomendado: una columna
    GENERADA (generated always as) de tipo tsrange que combine (date + start_time) y
    (date + end_time), o si la versión de Postgres complica la columna generada con casts, definí
    el rango en la propia expresión de la constraint. Elegí la forma más robusta y explicá cuál
    usaste y por qué.
  - Constraint EXCLUDE USING gist: court_id WITH =, y el rango temporal WITH && (solapamiento),
    con un WHERE que la limite a status <> 'cancelado' (las canceladas NO deben bloquear, coherente
    con la regla de disponibilidad ya existente).
  - IMPORTANTE sobre horas: el resto del sistema usa 'HH:MM' text y compara lexicográficamente; un
    turno hasta medianoche es '23:59' (ya normalizado). Asegurate de que el rango respete esto y no
    rompa con turnos al límite del día.
  - Cuando la constraint dispare en una inserción concurrente, capturá ese error específico de
    Postgres (violación de exclusión) y traducilo a un resultado tipado tipo SLOT_NO_DISPONIBLE,
    para que el bot responda "ese turno ya no está disponible" en vez de un error crudo.

  Hacé la creación de la reserva de forma atómica (la verificación final + inserción protegidas por
  la constraint). Si preferís encapsular en una función Postgres (RPC) la inserción que traduce la
  violación de constraint a SLOT_NO_DISPONIBLE, está bien; o manejalo en el data layer capturando
  el código de error de Postgres. Elegí y explicá.

═══ MIGRACIÓN (DDL — la aplico YO) ═══
- Recordá la regla del repo: el DDL corre por DIRECT_URL (puerto 5432, conexión directa), NO por el
  pooler. La constraint EXCLUDE y CREATE EXTENSION fallan por el pooler. La config de drizzle ya usa
  DIRECT_URL para migraciones, así que está listo — solo generá la migración, no la apliques vos.
- La migración incluye: columnas nuevas en bookings si hacen falta (customer_name, customer_phone,
  booking_code unique), extensión btree_gist, la columna de rango (si usás esa vía) y la constraint
  EXCLUDE.
- Reportá: qué columnas agregás, cómo construís el rango, y CUÁNTAS filas existentes podrían violar
  la nueva constraint EXCLUDE (¿hay ya en la base dos bookings no cancelados solapados en la misma
  cancha? Si los hay, la constraint NO se va a poder crear hasta resolverlos — reportámelo ANTES de
  que yo aplique, con la lista de conflictos, para que yo decida cómo limpiarlos).

═══ DOCUMENTACIÓN (importante — empezá a mantener el contexto del proyecto) ═══
Creá docs/PROYECTO.md (si no existe) y documentá, en lenguaje claro:
- Qué hace el sistema (asistente de pádel del pueblo: admins cargan agenda, bot reserva).
- Glosario de negocio: lugar/club, cancha/court, turno/reserva/booking, hold, booking_code,
  origin (admin/bot), payment_status (impago/senado/pagado), los estados de status.
- El flujo de reserva del bot (esta fase) end-to-end.
- Las reglas clave: disponibilidad (libre si no hay booking status<>cancelado solapado),
  anti-doble-booking en dos capas (B software + A constraint), reserva = simple/bot/confirmado/impago.
- Decisiones tomadas y su porqué (las que apliquen a esta fase). Marcá lo que es MVP vs fase futura
  (pago, hold con expiración, cancelación, customers global).
Mantené este archivo como contexto vivo: en cada fase futura, actualizalo. NO documentes secretos.

═══ TESTS (vitest) — foco en el doble-booking ═══
- Reserva exitosa: crea booking con type='simple', origin='bot', status='confirmado',
  payment_status='impago', con booking_code generado y nombre/teléfono guardados.
- booking_code: formato 3 letras + 3 números; es único; si colisiona, reintenta.
- CAPA B: si el turno se ocupó entre la búsqueda y la confirmación, el bot NO escribe y responde
  "ya no está disponible" + opciones.
- CAPA A (el más importante): simulá DOS inserciones concurrentes del MISMO turno → solo UNA
  queda, la otra recibe SLOT_NO_DISPONIBLE. Verificá que en la base NO quedan dos bookings no
  cancelados solapados en esa cancha.
- Una reserva cancelada NO bloquea el turno (se puede reservar de nuevo).
- Mantené verdes los 109 tests existentes y la lógica de disponibilidad (no la toques).

═══ DEFINICIÓN DE TERMINADO ═══
tsc/lint/tests verdes; migración generada (la aplico yo, reportando conflictos potenciales antes);
booking_code único; anti-doble-booking en dos capas funcionando; nombre/teléfono en el booking;
docs/PROYECTO.md creado; service_role solo server-side; sin tocar la lógica de disponibilidad ni
construir pago/cancelación/hold-con-expiración.