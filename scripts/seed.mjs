import postgres from "postgres";
import { createClient } from "@supabase/supabase-js";

const DATABASE_URL = process.env.DATABASE_URL;
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!DATABASE_URL) { console.error("Missing DATABASE_URL"); process.exit(1); }

const sql = postgres(DATABASE_URL);
const adminClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false }
});

async function run() {
  // 1. Club
  const [club] = await sql`
    INSERT INTO clubs (name, timezone, plan, address, city, neighborhood, phone)
    VALUES ('Pádel Central', 'America/Argentina/Buenos_Aires', 'club',
      'Av. Cabildo 2180', 'Buenos Aires', 'Belgrano', '+54 11 4789-0123')
    ON CONFLICT DO NOTHING
    RETURNING id
  `;
  let clubId;
  if (club) {
    clubId = club.id;
  } else {
    const [existing] = await sql`SELECT id FROM clubs WHERE name = 'Pádel Central' LIMIT 1`;
    clubId = existing.id;
  }
  console.log("Club:", clubId);

  // 2. Sport
  const [sport] = await sql`
    INSERT INTO sports (name, slug)
    VALUES ('Pádel', 'padel')
    ON CONFLICT (slug) DO UPDATE SET name = 'Pádel'
    RETURNING id
  `;
  const sportId = sport.id;
  console.log("Sport:", sportId);

  // 3. Courts
  const courtDefs = [
    { name: "Cancha 1", surface: "cristal", sort_order: 1 },
    { name: "Cancha 2", surface: "cristal", sort_order: 2 },
    { name: "Cancha 3", surface: "muro", sort_order: 3 },
  ];
  const courtIds = [];
  for (const c of courtDefs) {
    const existing = await sql`SELECT id FROM courts WHERE club_id = ${clubId} AND name = ${c.name} LIMIT 1`;
    if (existing.length > 0) {
      courtIds.push(existing[0].id);
    } else {
      const [row] = await sql`
        INSERT INTO courts (club_id, sport_id, name, surface, sort_order, active)
        VALUES (${clubId}, ${sportId}, ${c.name}, ${c.surface}, ${c.sort_order}, true)
        RETURNING id
      `;
      courtIds.push(row.id);
    }
  }
  const [c1Id, c2Id, c3Id] = courtIds;
  console.log("Courts:", courtIds);

  // 4. Opening hours (all 7 days)
  await sql`DELETE FROM opening_hours WHERE club_id = ${clubId}`;
  for (let d = 0; d < 7; d++) {
    await sql`
      INSERT INTO opening_hours (club_id, weekday, open_time, close_time, slot_minutes)
      VALUES (${clubId}, ${d}, '08:00', '23:30', 90)
    `;
  }
  console.log("Opening hours seeded");

  // 5. Customers
  const customerDefs = [
    { name: "Martín G.", phone: "+54 9 11 5521-0098" },
    { name: "Carlos M.", phone: "+54 9 11 4477-2231" },
    { name: "Sofía R.", phone: "+54 9 11 6688-1190" },
    { name: "Diego P.", phone: "+54 9 11 2233-7781" },
  ];
  const customerIds = {};
  for (const c of customerDefs) {
    const existing = await sql`SELECT id FROM customers WHERE club_id = ${clubId} AND name = ${c.name} LIMIT 1`;
    if (existing.length > 0) {
      customerIds[c.name] = existing[0].id;
    } else {
      const [row] = await sql`
        INSERT INTO customers (club_id, name, phone)
        VALUES (${clubId}, ${c.name}, ${c.phone})
        RETURNING id
      `;
      customerIds[c.name] = row.id;
    }
  }
  console.log("Customers seeded");

  // 6. Professors
  const professorDefs = ["Lucía Fernández", "Martín Sosa", "Romina Díaz"];
  const professorIds = {};
  for (const name of professorDefs) {
    const existing = await sql`SELECT id FROM professors WHERE club_id = ${clubId} AND name = ${name} LIMIT 1`;
    if (existing.length > 0) {
      professorIds[name] = existing[0].id;
    } else {
      const [row] = await sql`
        INSERT INTO professors (club_id, name, active)
        VALUES (${clubId}, ${name}, true)
        RETURNING id
      `;
      professorIds[name] = row.id;
    }
  }
  console.log("Professors seeded");

  // 7. Event (for 2026-06-24, Wednesday)
  await sql`DELETE FROM bookings WHERE club_id = ${clubId} AND date IN ('2026-06-23','2026-06-24') AND type = 'evento'`;
  await sql`DELETE FROM events WHERE club_id = ${clubId} AND name = 'Americano abierto'`;
  const [americano] = await sql`
    INSERT INTO events (club_id, name, kind, date, start_time, end_time, court_ids, category, price_per_player, capacity, registered_count, status)
    VALUES (${clubId}, 'Americano abierto', 'americano', '2026-06-24', '20:30', '22:00',
      ${sql.array([c1Id, c2Id, c3Id])},
      '5ª / 6ª', 6000, 16, 12, 'inscripcion_abierta')
    RETURNING id
  `;
  const americanoId = americano.id;
  console.log("Event:", americanoId);

  // 8. More events for Ajustes
  await sql`DELETE FROM events WHERE club_id = ${clubId} AND name != 'Americano abierto'`;
  await sql`
    INSERT INTO events (club_id, name, kind, date, start_time, end_time, court_ids, capacity, registered_count, status)
    VALUES
      (${clubId}, 'Torneo Apertura', 'torneo', '2026-06-27', '09:00', '18:00',
        ${sql.array([c1Id, c2Id, c3Id])}, 32, 24, 'programado'),
      (${clubId}, 'Clínica con ex-profesional', 'clinica', '2026-07-01', '19:00', '21:00',
        ${sql.array([c1Id, c2Id])}, 12, 6, 'programado')
  `;
  console.log("Extra events seeded");

  // 9. Recurring rules
  await sql`DELETE FROM recurring_rules WHERE club_id = ${clubId}`;
  // Lucía clase Lun-Vie 08:00-16:00 (weekday 0-4)
  for (let d = 0; d <= 4; d++) {
    await sql`
      INSERT INTO recurring_rules (club_id, type, court_id, professor_id, weekday, start_time, end_time, valid_from, active)
      VALUES (${clubId}, 'clase', ${c3Id}, ${professorIds["Lucía Fernández"]}, ${d}, '08:00', '16:00', '2026-01-01', true)
    `;
  }
  // Carlos M. fijo martes 19:00-20:30
  await sql`
    INSERT INTO recurring_rules (club_id, type, court_id, customer_id, weekday, start_time, end_time, valid_from, active)
    VALUES (${clubId}, 'fijo', ${c1Id}, ${customerIds["Carlos M."]}, 1, '19:00', '20:30', '2026-01-01', true)
  `;
  // Grupo Las Pibas fijo viernes 20:30-22:00
  await sql`
    INSERT INTO recurring_rules (club_id, type, court_id, weekday, start_time, end_time, valid_from, active, notes)
    VALUES (${clubId}, 'fijo', ${c2Id}, 4, '20:30', '22:00', '2026-01-01', true, 'Grupo Las Pibas')
  `;
  // Equipo Liga A fijo domingos 11:00-12:30
  await sql`
    INSERT INTO recurring_rules (club_id, type, court_id, weekday, start_time, end_time, valid_from, active, notes)
    VALUES (${clubId}, 'fijo', ${c3Id}, 6, '11:00', '12:30', '2026-01-01', true, 'Equipo Liga A')
  `;
  console.log("Recurring rules seeded");

  // 10. Bookings for 2026-06-24 (Wednesday, weekday=2)
  await sql`DELETE FROM bookings WHERE club_id = ${clubId} AND date IN ('2026-06-23','2026-06-24')`;

  // Classes 08:00-16:00 all 3 courts
  for (const cid of [c1Id, c2Id, c3Id]) {
    await sql`
      INSERT INTO bookings (club_id, court_id, date, start_time, end_time, type, status, professor_id, notes)
      VALUES (${clubId}, ${cid}, '2026-06-24', '08:00', '16:00', 'clase', 'confirmado',
        ${professorIds["Lucía Fernández"]}, 'Escuela de pádel')
    `;
  }
  // 16:00-17:30 C2: Martín G. simple pagado
  await sql`
    INSERT INTO bookings (club_id, court_id, date, start_time, end_time, type, status, customer_id, price, payment_status)
    VALUES (${clubId}, ${c2Id}, '2026-06-24', '16:00', '17:30', 'simple', 'confirmado',
      ${customerIds["Martín G."]}, 13000, 'pagado')
  `;
  // 16:00-17:30 C3: clase Lucía 4 alumnos
  await sql`
    INSERT INTO bookings (club_id, court_id, date, start_time, end_time, type, status, professor_id, notes)
    VALUES (${clubId}, ${c3Id}, '2026-06-24', '16:00', '17:30', 'clase', 'confirmado',
      ${professorIds["Lucía Fernández"]}, '4 alumnos')
  `;
  // 17:30-19:00 C1: bloqueo mantenimiento
  await sql`
    INSERT INTO bookings (club_id, court_id, date, start_time, end_time, type, status, notes)
    VALUES (${clubId}, ${c1Id}, '2026-06-24', '17:30', '19:00', 'bloqueo', 'confirmado', 'Mantenimiento de red')
  `;
  // 19:00-20:30 C1: Sofía R. simple impago
  await sql`
    INSERT INTO bookings (club_id, court_id, date, start_time, end_time, type, status, customer_id, price, payment_status)
    VALUES (${clubId}, ${c1Id}, '2026-06-24', '19:00', '20:30', 'simple', 'confirmado',
      ${customerIds["Sofía R."]}, 12000, 'impago')
  `;
  // 19:00-20:30 C3: Diego P. fijo
  await sql`
    INSERT INTO bookings (club_id, court_id, date, start_time, end_time, type, status, customer_id)
    VALUES (${clubId}, ${c3Id}, '2026-06-24', '19:00', '20:30', 'fijo', 'confirmado',
      ${customerIds["Diego P."]})
  `;
  // 20:30-22:00 C1, C2, C3: evento americano
  for (const cid of [c1Id, c2Id, c3Id]) {
    await sql`
      INSERT INTO bookings (club_id, court_id, date, start_time, end_time, type, status, event_id)
      VALUES (${clubId}, ${cid}, '2026-06-24', '20:30', '22:00', 'evento', 'confirmado', ${americanoId})
    `;
  }
  // 22:00-23:30 C2: Carlos M. seña
  await sql`
    INSERT INTO bookings (club_id, court_id, date, start_time, end_time, type, status, customer_id, price, payment_status)
    VALUES (${clubId}, ${c2Id}, '2026-06-24', '22:00', '23:30', 'simple', 'confirmado',
      ${customerIds["Carlos M."]}, 13000, 'senado')
  `;
  console.log("Bookings seeded");

  // 11. Create admin user juanimolfinooo@gmail.com
  const adminEmail = "juanimolfinooo@gmail.com";
  const adminPassword = "PadelTester2026!";

  let authUserId;
  const { data: listData } = await adminClient.auth.admin.listUsers({ perPage: 1000 });
  const existing = listData?.users?.find(u => u.email === adminEmail);
  if (existing) {
    authUserId = existing.id;
    console.log("Auth user already exists:", authUserId);
  } else {
    const { data, error } = await adminClient.auth.admin.createUser({
      email: adminEmail,
      password: adminPassword,
      email_confirm: true,
      user_metadata: { invited_role: "admin", venue_name: "Pádel Central" }
    });
    if (error) { console.error("Error creating admin user:", error.message); }
    else { authUserId = data.user.id; console.log("Created auth user:", authUserId); }
  }

  if (authUserId) {
    await sql`
      INSERT INTO users (auth_user_id, email, role, venue_name, club_id)
      VALUES (${authUserId}, ${adminEmail}, 'admin', 'Pádel Central', ${clubId})
      ON CONFLICT (auth_user_id) DO UPDATE
        SET role = 'admin', venue_name = 'Pádel Central', club_id = ${clubId}, updated_at = NOW()
    `;
    console.log("Admin user linked to club");
  }

  // 12. Link superadmin club too
  await sql`UPDATE users SET club_id = ${clubId} WHERE email = 'juanymolfino@hotmail.com'`;
  console.log("Superadmin linked to club");

  await sql.end();
  console.log("\n✅ Seed complete!");
  console.log(`Admin user: ${adminEmail} / ${adminPassword}`);
}

run().catch(err => { console.error(err); process.exit(1); });
