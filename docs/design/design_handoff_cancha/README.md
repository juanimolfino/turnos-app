# Handoff: Cancha — Plataforma de turnos para clubes deportivos (MVP)

## 1. Resumen

**Cancha** es una plataforma web para que los dueños/administradores de un club gestionen los
turnos de sus canchas desde un solo panel. El MVP arranca con **pádel** (un club con 3 canchas),
pero el modelo está pensado para extenderse a más deportes y más canchas sin rehacer nada.

El objetivo central del producto: **ver el día de un vistazo y saber al instante qué cancha está
libre**, sin planillas ni WhatsApp cruzado, y poder actuar sobre cada turno (reservar, dar de baja
y avisar, marcar clase, armar un torneo, etc.).

Este handoff cubre **todo lo que existe hasta hoy**. A partir de acá vamos a ir agregando y
corrigiendo funcionalidades de forma incremental.

---

## 2. Sobre los archivos de diseño

Los archivos de este paquete son **referencias de diseño hechas en HTML** — un prototipo que muestra
el aspecto y el comportamiento buscados, **no código de producción para copiar tal cual**.

- `Cancha.dc.html` — el prototipo completo (las 4+1 pantallas, navegables entre sí).
- `support.js` — runtime del prototipo. **No es parte del producto**; solo hace funcionar el HTML.
  Ignoralo al implementar.

La tarea es **recrear estas pantallas en el stack objetivo** que ya definió el equipo:
**Next.js (App Router) + TypeScript + Tailwind CSS**, más una base de datos relacional
(sugerencia: **PostgreSQL** con **Prisma**). El esquema de datos está en `DATA_MODEL.md`.

> Cómo abrir el prototipo para mirarlo: abrí `Cancha.dc.html` en el navegador. Para saltar directo a
> una pantalla podés cambiar el prop `startScreen` (`landing` | `login` | `dashboard` | `ajustes` |
> `estadisticas`). La navegación interna también funciona haciendo clic.

---

## 3. Fidelidad

**Alta fidelidad (hi-fi).** Colores, tipografías, espaciados e interacciones son los finales que
queremos. Recreá la UI lo más fiel posible usando Tailwind. Los datos que se ven son de ejemplo
(*seed*) para mostrar todos los estados; no son reales.

---

## 4. Arquitectura de pantallas

```
/ (landing)        → pública, invita a ingresar
/login             → login de admin (usuario + contraseña)
/dashboard         → agenda del día (pantalla principal del admin)
/ajustes           → configuración recurrente de la agenda
/estadisticas      → métricas para el dueño
```

`/dashboard`, `/ajustes` y `/estadisticas` comparten un **layout de app** con sidebar fija a la
izquierda (248px) y contenido scrolleable a la derecha. `/` y `/login` son pantallas públicas sin
sidebar.

---

## 5. Pantallas en detalle

### 5.1 Landing (`/`)
- **Propósito:** explicar el producto e invitar a ingresar.
- **Layout:** nav superior (logo izq. + links + botón "Ingresar" der.), hero a 2 columnas
  (texto izq. / imagen der.), fila de 3 features, footer.
- **Hero:** título grande en serif, párrafo, dos botones ("Ingresar al panel" → `/login`,
  "Ver demo en vivo →" → `/dashboard`). La imagen de la derecha es un **placeholder** de la cancha
  (lo reemplaza el cliente por una foto real). Badge verde "Empezamos con pádel · pronto más deportes".
- **Features:** *Vista del día en vivo* / *Configurás tu semana* / *Eventos que llenan canchas*.

### 5.2 Login (`/login`)
- **Propósito:** autenticar al admin del club.
- **Layout:** tarjeta centrada (≈392px) sobre fondo crema. Logo, título serif, campos
  **Usuario** (email) y **Contraseña**, link "¿Olvidaste tu contraseña?", botón "Ingresar" → `/dashboard`,
  link "← Volver al inicio".
- En el MVP el login real es contra la tabla de admins (ver `DATA_MODEL.md`). El prototipo entra directo.

### 5.3 Dashboard — Agenda del día (`/dashboard`) — **pantalla principal**
- **Propósito:** ver y operar todos los turnos del día.
- **Encabezado:** botón "Hoy", flechas ‹ ›, fecha en serif ("Martes 23 de junio") + subtítulo
  (club · cantidad de canchas). A la derecha: **chips de filtro** (Todas / Cancha 1 / 2 / 3) y botón
  "+ Nuevo turno".
- **Leyenda** de estados (Libre, Reservado, Clase, Turno fijo, Americano/torneo).
- **Grilla** (esto es el corazón del producto):
  - Filas = **franjas horarias**. Columnas = **canchas**. Más una columna especial **"Disponibilidad"**.
  - **Columna "Disponibilidad" (semáforo):** por cada franja, agrega el estado de TODAS las canchas:
    - 🟢 **verde "Todas libres"** si las N canchas están libres,
    - 🟡 **amarillo "x/N libres"** si hay algunas libres y otras tomadas,
    - 🔴/gris **"Completo"** si no queda ninguna.
    Esto resuelve el caso "tengo 10 canchas y quiero saber rápido si a las 16 hay alguna libre" sin
    revisar una por una. Si la franja tiene un evento, muestra además una etiqueta (ej. "Americano abierto").
  - **Banda 08:00–16:00:** bloque especial a lo ancho ("Escuela de pádel · clases · las 3 canchas
    ocupadas"). Representa horario tomado por clases.
  - **Franjas de la tarde/noche:** turnos de 1,5 h (16:00, 17:30, 19:00, 20:30, 22:00). Cada celda de
    cancha muestra estado + nombre/sub-dato. **Las ventanas horarias son flexibles**: la grilla no es
    rígida, un turno puede tener inicio/fin arbitrarios (ver "Generación de slots" en `DATA_MODEL.md`).
  - **Click en una celda** → abre el **drawer de acciones** (5.3.1).
- **Filtro por cancha:** al elegir una cancha, la grilla muestra solo esa columna.

#### 5.3.1 Drawer de turno (panel lateral derecho, ≈392px)
Se abre al tocar una celda. Contiene:
- Encabezado: "Turno seleccionado", rango horario (serif), cancha + fecha, botón cerrar (✕).
- Chip de estado (con su color) + sub-dato ("Turno simple · pagado", "4 alumnos", etc.).
- **Tarjeta de cliente** (si el turno tiene cliente): avatar con inicial, nombre, teléfono, y dato de
  frecuencia ("8 turnos este mes" / "Cliente fijo desde 2024").
- **Acciones** (botones, varían según el estado del turno):
  - **Libre:** Reservar turno · Marcar como clase · Crear americano/torneo · Bloquear horario
  - **Reservado:** Ver datos del cliente · Pasar a turno fijo · Reprogramar · **Dar de baja y avisar** (rojo)
  - **Turno fijo:** Ver datos del cliente · Editar recurrencia · **Suspender sólo por hoy** (rojo)
  - **Clase:** Ver clase · Cambiar profesor · **Liberar horario** (rojo)
  - **Evento (americano/torneo):** Ver inscriptos · Editar evento · Compartir link de inscripción · **Cancelar evento** (rojo)
- Nota fija: "Al dar de baja un turno, el cliente recibe el aviso automáticamente por WhatsApp y mail."

### 5.4 Ajustes (`/ajustes`)
- **Propósito:** configurar la agenda recurrente *una vez* para que se repita cada semana. Después se
  editan los días puntuales desde el dashboard.
- **Header:** título + botón "Guardar cambios".
- **Tabs:** Plantilla semanal · Clases · Turnos fijos · Eventos.
  - **Plantilla semanal:** grilla Lun→Dom × bandas (Mañana / Tarde / Noche) con bloques de color que
    resumen qué pasa cada día (Clases, Abiertos, Fijos, Americano/Torneo). Click en un bloque = editar
    ese día.
  - **Clases:** lista de clases de profesores recurrentes (profesor, día/rango, cancha) + "Agregar clase".
  - **Turnos fijos:** lista de clientes que vienen siempre el mismo día/hora (cliente, día, hora, cancha)
    + "Agregar turno fijo semanal".
  - **Eventos:** tarjetas de americanos/torneos/clínicas programados (nombre, fecha/hora, canchas,
    cupos, estado) + "Organizar americano o torneo".

### 5.5 Estadísticas (`/estadisticas`)
- **Propósito:** que el dueño vea cómo viene el negocio.
- **Toggle de período:** Semana / Mes / Año.
- **KPIs (4 tarjetas):** Ocupación (%), Ingresos de la semana ($), Turnos tomados (n de N),
  Turnos libres (n).
- **Gráfico:** ocupación por día de la semana (barras verdes).
- **Clientes frecuentes:** lista con avatar, nombre, cantidad de turnos y monto.
- **Tira inferior:** ingresos del mes / del año / eventos del mes.

---

## 6. Funcionalidades del MVP (alcance actual)

Esto es lo que el producto debe poder hacer **hasta hoy**:

1. **Autenticación** de admin (login con email + contraseña; sesión).
2. **Agenda del día**: ver, por club, todas las canchas y franjas horarias de una fecha, con el
   **semáforo de disponibilidad agregada** por franja, y **filtro por cancha**.
3. **Operar un turno** desde el drawer:
   - Reservar/tomar un turno desde el admin (a nombre de un cliente).
   - Dar de baja un turno **y notificar al cliente** (WhatsApp + email).
   - Marcar una franja como **clase** (bloqueo de profesor).
   - Marcarla como **turno fijo** (recurrente semanal).
   - **Organizar un americano/torneo** que ocupa una o varias canchas.
   - Bloquear/liberar/reprogramar una franja.
   - Ver datos del cliente.
4. **Configuración recurrente** (Ajustes): plantilla semanal, clases de profesores, turnos fijos y
   eventos programados → de acá se **generan** los turnos de cada día.
5. **Estadísticas** del club: ocupación, ingresos por período, tomados vs libres, clientes frecuentes.

**Fuera de alcance por ahora** (futuro, lo iremos sumando): reserva self-service por parte del jugador,
pagos online, multi-club por cuenta, app mobile, más deportes activos, inscripción pública a eventos.
El **modelo de datos ya contempla** la extensión a multideporte y multicancha para no migrar después.

---

## 7. Interacciones y comportamiento

- **Navegación:** clicks entre pantallas; la sidebar marca el ítem activo (fondo blanco + borde).
- **Filtro por cancha:** cambia las columnas visibles de la grilla (estado de UI, no recarga).
- **Click en celda de turno:** abre drawer lateral; click en el backdrop o ✕ lo cierra.
- **Tabs de Ajustes:** cambian el panel inferior (estado de UI).
- **Hover en celdas de turno:** leve elevación (`translateY(-1px)` + sombra suave), transición ~0.1s.
- **Estados de acción:** el set de botones del drawer depende del estado del turno (ver 5.3.1).
- **Responsive:** el MVP está pensado **desktop-first** (es una herramienta de mostrador/escritorio).
  La grilla de Ajustes tiene scroll horizontal en pantallas chicas. Mobile se puede encarar después.

---

## 8. Estado de UI necesario (en el cliente)

- `screen` activa (resuelta por routing en Next).
- `courtFilter`: `'all' | courtId` — filtro de canchas en el dashboard.
- `selectedSlot`: turno/celda seleccionada para el drawer (o `null`).
- `settingsTab`: tab activa en Ajustes.
- `statsPeriod`: `'week' | 'month' | 'year'`.
Todo lo demás (turnos, clientes, reglas, eventos, métricas) viene de la base de datos / API.

---

## 9. Design tokens

### Colores
| Rol | Hex |
|---|---|
| Fondo app (crema) | `#F4F1EA` |
| Superficie / panel | `#FCFBF8` |
| Blanco | `#FFFFFF` |
| Texto principal (tinta) | `#221F1B` |
| Texto secundario | `#6B6660` |
| Texto terciario / labels | `#928B7E` · `#A39C8F` |
| Borde | `#E7E1D6` · `#E0DACE` |
| **Acento (coral)** | `#C96442` (hover ~`#B5573A`) |

**Estados de turno** (fondo / borde / texto / punto):
| Estado | bg | border | text | dot |
|---|---|---|---|---|
| Libre | `#E9F3EA` | `#CFE6D2` | `#2F7D4E` | `#3E9B63` |
| Reservado | `#FFFFFF` | `#E7E1D6` | `#7A746A` | `#B8B0A2` |
| Clase | `#EAF0F8` | `#D3DEF0` | `#3D5C93` | `#5B7FBE` |
| Turno fijo | `#F1EAF7` | `#E2D4EF` | `#6B4E9E` | `#8A6BC4` |
| Evento (americano/torneo) | `#FBEBE2` | `#F2D6C5` | `#B0572C` | `#C96442` |

**Semáforo de disponibilidad:**
| Nivel | bg | text | dot |
|---|---|---|---|
| Todas libres (verde) | `#E9F3EA` | `#2F7D4E` | `#3E9B63` |
| Parcial (amarillo) | `#F8EFD7` | `#90701E` | `#D9A93B` |
| Completo (rojo/gris) | `#F3E7E2` | `#9A5E4C` | `#C2887A` |

**Botón peligro (drawer):** bg `#FCEEE9` · texto `#B23A28` · borde `#F1D3CB`.
**Barras de ocupación:** gradiente verde `#4FAE73` → `#2F7D4E`.

### Tipografía
- **Display / títulos:** `Instrument Serif` (400). Usada en H1 de landing, fechas, KPIs, títulos de sección.
- **UI / cuerpo:** `Hanken Grotesk` (400–800). Todo el resto.
- **Mono (acentos):** `Space Mono` (solo el label del placeholder de imagen).
- Tamaños de referencia: H1 landing 58px · título sección 26–28px · KPI 30–32px · cuerpo 14–15px ·
  labels 11px uppercase con `letter-spacing` ~.05em.

### Radios y sombras
- Radios: tarjetas 14–18px · celdas/botones/inputs 9–11px · pills 999px.
- Sombra de tarjeta: muy sutil. Drawer: `-14px 0 44px -22px rgba(0,0,0,.4)`.
  Botón primario: `0 2px 8px -2px rgba(201,100,66,.5)`.

### Espaciado
- Padding de contenido: 24–28px. Sidebar 248px. Drawer ≈392px.
- Gaps frecuentes: 8 / 14 / 18 / 20px.

---

## 10. Assets
- **Sin imágenes externas.** El logo es un cuadrado coral con un círculo blanco (la pelota) + wordmark
  "Cancha" en Instrument Serif — reproducible en CSS.
- La **cancha del hero** es un placeholder (rectángulo verde con líneas blancas). El cliente subirá una
  **foto real de la cancha** para reemplazarlo.
- Íconos de la sidebar: SVGs de líneas simples (calendario, sliders, barras) — usar la librería de
  íconos del proyecto (ej. lucide).
- Fuentes desde Google Fonts: Instrument Serif, Hanken Grotesk, Space Mono.

---

## 11. Modelo de datos
Ver **`DATA_MODEL.md`** — incluye entidades, campos, relaciones, lógica de generación de turnos,
esquema Prisma + SQL, y datos de ejemplo (*seed*) que coinciden con lo que se ve en el prototipo
(martes 23 de junio).

---

## 12. Archivos en este paquete
- `Cancha.dc.html` — prototipo de referencia (todas las pantallas).
- `support.js` — runtime del prototipo (ignorar para producción).
- `DATA_MODEL.md` — modelo de datos y esquema de base de datos.
- `README.md` — este documento.
