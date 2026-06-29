# Visión y decisiones de producto — Cancha

> Esta sección complementa el `PROYECTO.md` técnico. El resto del documento explica
> **qué** hace el sistema y **cómo** está construido; esta sección explica **por qué**
> se decidió así. Pensada para que cualquier persona o IA que llegue al proyecto
> entienda la intención detrás de las decisiones, no solo el código.

---

## 1. Qué problema resuelve

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

---

## 2. Las decisiones de producto y su porqué

### Un solo bot central, no uno por club
El valor del producto es que el jugador **pregunta una vez y ve todo**. Si hubiera un
bot por club, se perdería justamente eso: el jugador tendría que hablar con varios bots,
igual que hoy habla con varios WhatsApp. Por eso hay **un único número/bot**, y la
búsqueda cruza todos los lugares. El club aparece en los resultados, no en "a quién le
escribiste".

### El bot es un canal, la lógica de negocio no le pertenece
El bot es un medio para acceder a la información; la inteligencia de reservas, pagos y
disponibilidad vive en la app, no en el bot. Esto permite que mañana el mismo "cerebro"
sirva a WhatsApp, a una app, o a lo que venga, sin reescribir nada. Por eso la
arquitectura separa **canal** (Telegram/WhatsApp, adaptadores) de **cerebro** (la lógica,
agnóstica al canal).

### Telegram primero, WhatsApp después
WhatsApp (Meta Cloud API) requiere verificación de negocio, número provisionado, tokens
permanentes y aprobación de plantillas: lento y burocrático. Telegram se configura en
minutos. Como la lógica es agnóstica al canal, se construye y prueba todo sobre Telegram
hoy, y sumar WhatsApp después es agregar un adaptador, sin tocar el cerebro ya probado.

### La IA es para que sea humano, no para que decida
El bot usa un modelo de lenguaje para **conversar de forma natural** (entender "el
sábado a la tarde", redactar como un asistente del pueblo). Pero la IA **nunca inventa
datos**: la disponibilidad, los horarios y las reservas salen de la base, y la IA solo
los expresa en palabras. Posicionamiento: es **"el asistente de pádel del pueblo"**, no
un formulario de reservas — un asistente que hoy reserva y mañana podrá responder
precios, direcciones y más.

### El dueño carga la agenda; el dato tiene que ser verdad
Todo el producto depende de que los dueños mantengan su agenda al día en el `/admin`. Si
el bot dice "hay turno a las 18" y cuando el jugador llega estaba ocupado, se pierde al
jugador y al dueño. Por eso el panel busca que cargar disponibilidad sea lo más simple
posible, y la fuente de verdad de "qué está libre" es siempre la base, una sola.

### Disponibilidad "pegada a la ocupación", no grilla fija
Los turnos disponibles se calculan a partir de los huecos reales entre lo ocupado (un
turno arranca donde termina la ocupación anterior), no sobre una grilla rígida anclada a
un horario fijo. Una grilla fija perdía huecos jugables reales (ej. un hueco de 19:00 a
20:30 que no caía en la grilla), y el bot decía "no hay" cuando sí había — el peor error
posible para un producto de reservas. La duración del turno es 90 min para pádel, pero
está pensada para ser configurable por deporte.

### El jugador no tiene login; se identifica por teléfono + nombre
Nadie hace login para reservar: le escribe a un bot. El teléfono sale del canal
(Telegram/WhatsApp lo proveen) y el nombre se pide una vez. Para el MVP, nombre y
teléfono se guardan **en la reserva misma**. Una tabla global de clientes (para clientes
frecuentes, preferencias, marketing) queda para una etapa posterior — pero el dato se
captura desde ahora, para no perderlo.

### Reserva automática, sin aprobación del dueño
Cuando el jugador reserva, queda reservado: el dueño **ve** la reserva, no la **aprueba**.
La reserva impacta directo en la misma agenda que el dueño usa, así que aparece en su
panel como cualquier otro turno, marcada con `origin: bot` para distinguir que vino del
asistente y no la cargó él.

### El anti-doble-booking es sagrado (dos capas)
Que dos jugadores reserven el mismo turno es el error más caro: se pierde a los dos y al
dueño queda mal. Por eso hay dos defensas: una capa de software que chequea antes de
escribir y maneja el caso con un mensaje amable, y una **constraint a nivel base de datos
que hace físicamente imposible** que existan dos reservas solapadas, aunque el código
fallara. La primera da buena experiencia; la segunda da garantía de hierro.

### El código de reserva tipo aerolínea
Como no hay login, el jugador necesita una forma de identificar **su** reserva para
cancelarla sin que otro pueda. Se le da un código corto tipo vuelo (`HYS324`) al
reservar. Ese código es la prueba de que la reserva es suya.

---

## 3. Pagos (diseñado, se implementa en una fase posterior)

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

---

## 4. Hacia dónde escala (visión, no construido)

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

---

## 5. Modelo de negocio (abierto, por decisión consciente)

Todavía no está definido cómo monetiza la plataforma, y es a propósito: el primer desafío
no es cobrar, es el **cambio cultural** — convencer a 8-10 dueños de adoptar un panel y
mantener su agenda al día. La estrategia es entrar accesible, generar la necesidad, y
recién después introducir un modelo de cobro. Las opciones contempladas (sin decidir):
suscripción de los clubs por usar el panel, o comisión por reserva (el *marketplace fee*
ya previsto en el diseño de pagos). El diseño no cierra ninguno de los dos caminos.

---

## 6. Principios que guían el proyecto

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