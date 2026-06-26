/**
 * seed-demo.mjs
 * Crea 3 clubs DEMO con canchas, ciudad, API key y una semana de bloques
 * variados (clases, fijos, simples, americanos, torneos, bloqueos), para simular
 * el uso de 3 lugares y las consultas del bot.
 *
 * Uso:   node --env-file=.env.local scripts/seed-demo.mjs
 * Borrar: node --env-file=.env.local scripts/seed-demo.mjs --clean
 */

import postgres from "postgres";
import { randomUUID } from "crypto";

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) { console.error("Falta DATABASE_URL"); process.exit(1); }

const sql = postgres(DATABASE_URL.trim().replace(/^["']|["']$/g, ""), { prepare: false });

const CLEAN = process.argv.includes("--clean");

// ── Semana en curso (lunes a domingo, hora local) ───────────────────────────
function pad(n) { return String(n).padStart(2, "0"); }
function ymd(d) { return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; }
const now = new Date();
const dow = now.getDay();                 // 0=Dom
const diffToMon = dow === 0 ? -6 : 1 - dow;
const monday = new Date(now); monday.setDate(now.getDate() + diffToMon);
const weekDates = Array.from({ length: 7 }, (_, i) => {
  const d = new Date(monday); d.setDate(monday.getDate() + i); return ymd(d);
});

// ── Definición de los 3 clubs DEMO ──────────────────────────────────────────
// weekday: 0=Lun … 6=Dom. courts: "all" o array de índices (0-based).
const CLUBS = [
  {
    name: "DEMO · Pádel del Centro", city: "Rosario", neighborhood: "Centro",
    phone: "341-5550001", apiKey: "ck_demo_centro", requiresPayment: false, courts: 3,
    blocks: [
      // Clases mañana lun-vie en las 3 canchas
      ...[0, 1, 2, 3, 4].map((wd) => ({ weekday: wd, courts: "all", start: "08:00", end: "13:00", type: "clase", note: "Escuela de pádel" })),
      // Fijos de noche
      { weekday: 0, courts: [0], start: "19:00", end: "20:30", type: "fijo", note: "Grupo Martín" },
      { weekday: 2, courts: [1], start: "20:00", end: "21:30", type: "fijo", note: "Las pibas" },
      { weekday: 1, courts: [2], start: "18:00", end: "19:30", type: "simple", note: "Turno suelto" },
      // Americano viernes noche en todas
      { weekday: 4, courts: "all", start: "20:00", end: "23:00", type: "americano", note: "Americano mixto" },
      // Torneo sábado tarde
      { weekday: 5, courts: "all", start: "14:00", end: "20:00", type: "torneo", note: "Torneo interno" },
      { weekday: 6, courts: [0], start: "10:00", end: "11:30", type: "fijo", note: "Familia López" },
    ],
  },
  {
    name: "DEMO · La Esquina Pádel", city: "Rosario", neighborhood: "Pichincha",
    phone: "341-5550002", apiKey: "ck_demo_esquina", requiresPayment: true, courts: 2,
    blocks: [
      ...[0, 1, 2, 3, 4].map((wd) => ({ weekday: wd, courts: [0], start: "09:00", end: "12:00", type: "clase", note: "Clases con Caro" })),
      { weekday: 3, courts: "all", start: "21:00", end: "23:30", type: "americano", note: "Americano cat 5/6" },
      { weekday: 5, courts: [0], start: "16:00", end: "17:30", type: "fijo", note: "Equipo torneo" },
    ],
  },
  {
    name: "DEMO · Norte Pádel Club", city: "Funes", neighborhood: null,
    phone: "341-5550003", apiKey: "ck_demo_norte", requiresPayment: false, courts: 4,
    blocks: [
      ...[0, 1, 2, 3, 4].map((wd) => ({ weekday: wd, courts: [0, 1, 2], start: "08:00", end: "11:00", type: "clase", note: "Academia Norte" })),
      // Cancha 4 cerrada por mantenimiento el lunes todo el día
      { weekday: 0, courts: [3], start: "08:00", end: "23:00", type: "bloqueo", note: "Mantenimiento" },
      { weekday: 4, courts: [0, 1], start: "20:00", end: "23:00", type: "americano", note: "Americano Funes" },
      { weekday: 2, courts: [3], start: "19:00", end: "20:30", type: "fijo", note: "Los pibes" },
    ],
  },
];

async function clean() {
  const demo = await sql`SELECT id, name FROM clubs WHERE name LIKE 'DEMO ·%'`;
  for (const c of demo) {
    await sql`DELETE FROM bookings WHERE club_id = ${c.id}`;
    await sql`DELETE FROM courts WHERE club_id = ${c.id}`;
    await sql`DELETE FROM clubs WHERE id = ${c.id}`;
    console.log("Borrado:", c.name);
  }
  console.log(demo.length ? "\n✅ Clubs DEMO eliminados." : "No había clubs DEMO.");
}

async function ensurePadelSport() {
  const found = await sql`SELECT id FROM sports WHERE slug = 'padel'`;
  if (found.length) return found[0].id;
  const [created] = await sql`INSERT INTO sports (name, slug) VALUES ('Pádel', 'padel') RETURNING id`;
  return created.id;
}

async function seed() {
  await clean(); // idempotente: re-seed limpio
  console.log(`\nSemana: ${weekDates[0]} → ${weekDates[6]}\n`);
  const sportId = await ensurePadelSport();

  for (const def of CLUBS) {
    const [club] = await sql`
      INSERT INTO clubs (name, city, neighborhood, phone, api_key, requires_payment)
      VALUES (${def.name}, ${def.city}, ${def.neighborhood}, ${def.phone}, ${def.apiKey}, ${def.requiresPayment})
      RETURNING id`;

    const courtIds = [];
    for (let i = 0; i < def.courts; i++) {
      const [court] = await sql`
        INSERT INTO courts (club_id, sport_id, name, sort_order)
        VALUES (${club.id}, ${sportId}, ${"Cancha " + (i + 1)}, ${i})
        RETURNING id`;
      courtIds.push(court.id);
    }

    let blockCount = 0;
    for (const b of def.blocks) {
      const groupId = randomUUID();
      const cols = b.courts === "all" ? courtIds : b.courts.map((i) => courtIds[i]);
      const date = weekDates[b.weekday];
      for (const courtId of cols) {
        await sql`
          INSERT INTO bookings (club_id, court_id, date, start_time, end_time, type, status, notes, block_group_id)
          VALUES (${club.id}, ${courtId}, ${date}, ${b.start}, ${b.end}, ${b.type}, 'confirmado', ${b.note}, ${groupId})`;
        blockCount++;
      }
    }

    console.log(`✅ ${def.name}`);
    console.log(`   ${def.courts} canchas · ${def.city}${def.neighborhood ? " / " + def.neighborhood : ""} · pago: ${def.requiresPayment ? "sí" : "no"}`);
    console.log(`   api_key: ${def.apiKey} · ${blockCount} bloques`);
    console.log(`   club_id: ${club.id}\n`);
  }

  console.log("✅ Seed completo. Probá el bot con esas api_key.\n");
}

(CLEAN ? clean() : seed())
  .catch((e) => { console.error(e); process.exitCode = 1; })
  .finally(() => sql.end());
