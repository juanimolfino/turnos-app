# Modelo de datos — Cancha (MVP)

Stack sugerido: **PostgreSQL + Prisma** (o Drizzle). Pensado para **multideporte y multicancha**
desde el día 1, aunque el MVP active solo pádel y un club.

---

## 1. Entidades y relaciones (resumen)

```
Club 1───* Court ───* Booking *───1 Customer
 │           │            │  ╲
 │           │            │   ╲──1 Professor
 │           *            │
 │       OpeningHour      *───? RecurringRule  (clases y turnos fijos)
 │                        │
 ├───* Sport (catálogo)   *───? Event ───* EventRegistration
 ├───* Customer
 ├───* Professor
 ├───* AdminUser
 └───* Notification (log de avisos)
```

Conceptos clave:
- Un **Booking (turno)** es cualquier franja **ocupada** de una cancha en una fecha concreta:
  reservado, clase, fijo (instancia), evento o bloqueo. **Un slot "Libre" NO es una fila**: es la
  ausencia de booking dentro del horario de apertura (ver §4, generación de slots).
- Las **RecurringRule** (clases recurrentes y turnos fijos) y los **Event** son *plantillas*: generan
  Bookings concretos para cada fecha. Guardamos las reglas, y materializamos/expandimos los turnos del
  día al consultarlos (o por un job).

---

## 2. Entidades (campos)

### Club
| campo | tipo | notas |
|---|---|---|
| id | uuid | PK |
| name | text | "Pádel Central" |
| timezone | text | "America/Argentina/Buenos_Aires" |
| plan | text | "club" (futuro: planes) |
| created_at | timestamptz | |

### Sport (catálogo, extensible)
| id | uuid | PK |
| name | text | "Pádel", "Tenis", "Fútbol 5"… |
| slug | text | "padel" |

### Court (cancha)
| id | uuid | PK |
| club_id | uuid | FK Club |
| sport_id | uuid | FK Sport |
| name | text | "Cancha 1" |
| surface | enum | `cristal` \| `muro` \| `cemento` \| `polvo_ladrillo`… (nullable) |
| sort_order | int | orden de visualización |
| active | bool | |

### AdminUser (login)
| id | uuid | PK |
| club_id | uuid | FK Club |
| email | citext | único |
| password_hash | text | |
| name | text | |
| role | enum | `owner` \| `admin` \| `staff` |
| created_at | timestamptz | |

### Customer (cliente del club)
| id | uuid | PK |
| club_id | uuid | FK Club |
| name | text | "Martín G." |
| phone | text | "+54 9 11 5521-0098" (para WhatsApp) |
| email | text | nullable |
| notes | text | nullable |
| created_at | timestamptz | (para "cliente desde…") |

### Professor (profesor)
| id | uuid | PK |
| club_id | uuid | FK Club |
| name | text | "Lucía Fernández" |
| active | bool | |

### OpeningHour (horario de apertura por día)
| id | uuid | PK |
| club_id | uuid | FK Club |
| weekday | int | 0=Lun … 6=Dom |
| open_time | time | "08:00" |
| close_time | time | "23:30" |
| slot_minutes | int | duración base del turno (90) |

> El horario y la duración del slot son **configurables** y pueden variar por día. Las ventanas son
> flexibles: un Booking puede no estar alineado a la grilla base (ej. clases de 08:00 a 16:00).

### Booking (turno) — entidad central
| campo | tipo | notas |
|---|---|---|
| id | uuid | PK |
| club_id | uuid | FK Club |
| court_id | uuid | FK Court |
| date | date | día del turno |
| start_time | time | inicio (flexible) |
| end_time | time | fin (flexible) |
| type | enum | `simple` \| `clase` \| `fijo` \| `evento` \| `bloqueo` |
| status | enum | `confirmado` \| `cancelado` \| `pendiente` |
| customer_id | uuid? | FK Customer (si aplica) |
| professor_id | uuid? | FK Professor (si type=clase) |
| event_id | uuid? | FK Event (si type=evento) |
| recurring_rule_id | uuid? | FK RecurringRule (si nació de una regla) |
| price | numeric? | ARS |
| payment_status | enum? | `pagado` \| `senado` \| `impago` |
| notes | text? | "4 alumnos", etc. |
| created_by | uuid | FK AdminUser |
| created_at | timestamptz | |

> Mapeo `type` → estado visual del prototipo: `simple`→**Reservado**, `clase`→**Clase**,
> `fijo`→**Turno fijo**, `evento`→**Americano/torneo**, `bloqueo`→bloqueado. La celda **Libre** no es
> un Booking.

### RecurringRule (clases y turnos fijos recurrentes)
| id | uuid | PK |
| club_id | uuid | FK Club |
| type | enum | `clase` \| `fijo` |
| court_id | uuid? | FK Court (nullable si rota) |
| customer_id | uuid? | FK Customer (si fijo) |
| professor_id | uuid? | FK Professor (si clase) |
| weekday | int | 0=Lun … 6=Dom |
| start_time | time | |
| end_time | time | |
| valid_from | date | |
| valid_until | date? | nullable = sin fin |
| active | bool | |
| notes | text? | |

> Ejemplos del prototipo: clase "Lucía Fernández, Lun–Vie 08:00–12:00, Cancha 3" (varias reglas, una por
> weekday) y turno fijo "Carlos M., martes 19:00–20:30, Cancha 1".

### Event (americano / torneo / clínica)
| id | uuid | PK |
| club_id | uuid | FK Club |
| name | text | "Americano abierto" |
| kind | enum | `americano` \| `torneo` \| `clinica` |
| date | date | |
| start_time | time | |
| end_time | time | |
| court_ids | uuid[] | canchas ocupadas (1..N) |
| category | text? | "5ª / 6ª" |
| price_per_player | numeric? | ARS |
| capacity | int | cupos totales (16) |
| registered_count | int | inscriptos (12) — o derivar de EventRegistration |
| status | enum | `inscripcion_abierta` \| `programado` \| `finalizado` \| `cancelado` |
| signup_link | text? | link público de inscripción (futuro) |

> Al crear un Event se generan Bookings `type=evento` en cada `court_id` para esa fecha/horario.

### EventRegistration (inscripción a evento)
| id | uuid | PK |
| event_id | uuid | FK Event |
| customer_id | uuid? | FK Customer (o name suelto) |
| name | text? | si no es cliente registrado |
| paid | bool | |
| created_at | timestamptz | |

### Notification (log de avisos al cliente)
| id | uuid | PK |
| club_id | uuid | FK Club |
| customer_id | uuid | FK Customer |
| booking_id | uuid? | FK Booking |
| channel | enum | `whatsapp` \| `email` |
| kind | enum | `cancelacion` \| `recordatorio` \| `confirmacion` |
| status | enum | `pendiente` \| `enviado` \| `error` |
| sent_at | timestamptz? | |

> "Dar de baja y avisar" = `Booking.status='cancelado'` + crear Notifications (WhatsApp + email).
> La integración real de envío (proveedor) queda para más adelante; modelar el log desde ya.

---

## 3. Consulta de la agenda del día (lo que pinta el dashboard)

Para `GET /api/agenda?clubId=&date=`:
1. Traer las **Court** activas del club (ordenadas por `sort_order`).
2. Traer el **OpeningHour** del weekday de esa fecha → genera la grilla base de franjas (§4).
3. Traer **Bookings** de esa fecha (incluye los expandidos de RecurringRule y de Event).
4. Para cada franja × cancha: si hay Booking que la solapa → su estado; si no → **Libre**.
5. **Semáforo por franja:** `freeCount = canchas sin booking`, `total = canchas`.
   - `free === total` → verde "Todas libres"
   - `free === 0` → rojo/gris "Completo"
   - resto → amarillo "free/total libres"

```ts
type SlotStatus = 'libre'|'simple'|'clase'|'fijo'|'evento'|'bloqueo';
interface AgendaCell { courtId: string; status: SlotStatus; booking?: Booking; }
interface AgendaRow {
  start: string; end: string;
  cells: AgendaCell[];
  summary: { free: number; total: number; level: 'green'|'amber'|'red'; eventLabel?: string };
}
```

---

## 4. Generación de slots (ventanas flexibles)

- La grilla base sale de `OpeningHour` (open→close en pasos de `slot_minutes`, p.ej. 90 min desde
  16:00: 16:00, 17:30, 19:00, 20:30, 22:00).
- Pero los **Bookings tienen su propio start/end** y pueden no respetar la grilla (ej. la clase
  08:00–16:00 ocupa varias franjas). Por eso la UI:
  - puede **fusionar** franjas contiguas con el mismo bloque (la "banda de clases" 08–16),
  - y debe resolver el estado por **solapamiento horario**, no por índice de slot.
- Regla práctica: una cancha está "tomada" en una franja si existe un Booking `confirmado` cuyo
  `[start,end)` solapa el `[franja.start, franja.end)`.

---

## 5. Esquema Prisma (referencia)

```prisma
model Club {
  id        String   @id @default(uuid())
  name      String
  timezone  String   @default("America/Argentina/Buenos_Aires")
  plan      String   @default("club")
  createdAt DateTime @default(now())
  courts    Court[]
  customers Customer[]
  // …relaciones
}

model Court {
  id        String  @id @default(uuid())
  clubId    String
  sportId   String
  name      String
  surface   String?
  sortOrder Int     @default(0)
  active    Boolean @default(true)
  club      Club    @relation(fields: [clubId], references: [id])
  bookings  Booking[]
}

enum BookingType { simple clase fijo evento bloqueo }
enum BookingStatus { confirmado cancelado pendiente }

model Booking {
  id            String        @id @default(uuid())
  clubId        String
  courtId       String
  date          DateTime      @db.Date
  startTime     String        // "16:00"
  endTime       String        // "17:30"
  type          BookingType
  status        BookingStatus @default(confirmado)
  customerId    String?
  professorId   String?
  eventId       String?
  recurringId   String?
  price         Decimal?
  paymentStatus String?
  notes         String?
  createdBy     String
  createdAt     DateTime      @default(now())
  court         Court         @relation(fields: [courtId], references: [id])
  @@index([clubId, date])
  @@index([courtId, date])
}
// …RecurringRule, Event, EventRegistration, Customer, Professor, OpeningHour, AdminUser, Notification
```

---

## 6. Endpoints sugeridos (App Router / route handlers)

```
POST   /api/auth/login
GET    /api/agenda?date=YYYY-MM-DD&courtId?         → grilla + semáforo del día
POST   /api/bookings                                → crear (reservar/clase/bloqueo)
PATCH  /api/bookings/:id                             → reprogramar / cambiar estado
POST   /api/bookings/:id/cancel                      → cancelar + disparar Notifications
POST   /api/bookings/:id/make-fixed                  → convertir en RecurringRule(fijo)
GET    /api/customers/:id                            → datos + historial (clientes frecuentes)
GET/POST/PATCH  /api/recurring-rules                 → clases y turnos fijos (Ajustes)
GET/POST/PATCH  /api/events                          → americanos / torneos (Ajustes)
GET    /api/stats?period=week|month|year             → KPIs, ocupación por día, frecuentes
```

---

## 7. Datos de ejemplo (seed) — martes 23 de junio

Club "Pádel Central", 3 canchas (C1, C2 cristal; C3 muro). Apertura 08:00–23:30, slot 90 min.

**Clases (RecurringRule type=clase, weekday=martes):** ocupan 08:00–16:00 las 3 canchas → en el día
se ven como la banda "Escuela de pádel".

**Bookings del día:**
| inicio | fin | cancha | type | cliente/dato |
|---|---|---|---|---|
| 16:00 | 17:30 | C2 | simple | Martín G. · pagado |
| 16:00 | 17:30 | C3 | clase | Prof. Lucía · 4 alumnos |
| 17:30 | 19:00 | — | — | (C1, C2, C3 libres) |
| 19:00 | 20:30 | C1 | fijo | Carlos M. (fijo, martes) |
| 19:00 | 20:30 | C3 | simple | Sofía R. · seña |
| 20:30 | 22:00 | C1+C2+C3 | evento | "Americano abierto" 12/16, cat. 5ª/6ª, $6.000/jugador |
| 22:00 | 23:30 | C1 | simple | Diego P. |

(Resto de celdas en esas franjas = Libre.)

**Eventos programados:** Americano abierto (hoy, 20:30–22:00, 3 canchas, 12/16, inscripción abierta);
Torneo Apertura (sáb 27 jun, 09:00–18:00, 3 canchas, 24/32); Clínica (mié 1 jul, 19:00–21:00, 2 canchas, 6/12).

**Turnos fijos:** Carlos M. (martes 19:00–20:30, C1); Grupo "Las Pibas" (viernes 20:30–22:00, C2);
Equipo Liga A (domingos 11:00–12:30, C3).

**Stats de ejemplo (semana):** ocupación 78% (+6%); ingresos semana $486.000 (+12%); 142/180 turnos
tomados, 38 libres; ocupación por día L–D: 62/78/70/82/91/96/74%; ingresos mes $1.920.000, año $18.400.000.
Clientes frecuentes: Carlos M. (14 turnos · $182.000), Sofía R. (9 · $108.000), Diego P. (7 · $84.000),
Grupo Las Pibas (6 · $96.000).
