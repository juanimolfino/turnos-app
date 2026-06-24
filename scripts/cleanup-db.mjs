/**
 * cleanup-db.mjs
 * Limpia datos de seed y usuarios huérfanos.
 * Deja: superadmin, admin de "Pádel Central", el club y sus canchas y horarios.
 * Elimina: bookings, customers, professors, events, recurring_rules, clubs y users de prueba.
 *
 * Uso: node --env-file=.env.local scripts/cleanup-db.mjs
 */

import postgres from "postgres";
import { createClient } from "@supabase/supabase-js";

const DATABASE_URL    = process.env.DATABASE_URL;
const SUPABASE_URL    = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!DATABASE_URL || !SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error("Faltan variables de entorno. Ejecutá: node --env-file=.env.local scripts/cleanup-db.mjs");
  process.exit(1);
}

const sql = postgres(DATABASE_URL, { ssl: { rejectUnauthorized: false } });
const adminAuth = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false }
});

const KEEP_EMAILS = ["juanymolfino@hotmail.com", "juanimolfinooo@gmail.com"];

async function run() {
  console.log("=== Estado actual ===");

  const users   = await sql`SELECT id, email, role, club_id FROM users ORDER BY created_at`;
  const clubs   = await sql`SELECT id, name FROM clubs`;
  const [{ n: bookCount }]  = await sql`SELECT COUNT(*) AS n FROM bookings`;
  const [{ n: custCount }]  = await sql`SELECT COUNT(*) AS n FROM customers`;
  const [{ n: profCount }]  = await sql`SELECT COUNT(*) AS n FROM professors`;

  console.log("Users en DB:", users.map(u => `${u.email} (${u.role ?? "sin-rol"})`).join(", "));
  console.log("Clubs:", clubs.map(c => c.name).join(", "));
  console.log(`Bookings: ${bookCount} | Customers: ${custCount} | Professors: ${profCount}`);

  // --- Auth users ---
  const { data: authData } = await adminAuth.auth.admin.listUsers({ perPage: 200 });
  const authUsers = authData?.users ?? [];
  console.log("\nAuth users:", authUsers.map(u => `${u.email} (confirmed: ${!!u.email_confirmed_at})`).join(", "));

  console.log("\n=== Limpiando ===");

  // 1. Encontrar el club del admin real
  const adminUser = users.find(u => u.email === "juanimolfinooo@gmail.com");
  const adminClubId = adminUser?.club_id ?? null;

  if (adminClubId) {
    console.log(`Club del admin: ${adminClubId}`);
  } else {
    console.log("El admin no tiene club_id asignado.");
  }

  // 2. Limpiar datos transaccionales del club (bookings, customers, professors, events, recurring_rules)
  const [{ n: bd }] = await sql`DELETE FROM bookings RETURNING id`.catch(() => sql`SELECT 0 AS n`);
  console.log(`Bookings eliminados.`);

  await sql`DELETE FROM recurring_rules`;
  console.log("Recurring rules eliminadas.");

  await sql`DELETE FROM events`;
  console.log("Events eliminados.");

  await sql`DELETE FROM customers`;
  console.log("Customers eliminados.");

  await sql`DELETE FROM professors`;
  console.log("Professors eliminados.");

  // 3. Eliminar clubs huérfanos (todos menos el del admin real)
  if (adminClubId) {
    const deleted = await sql`DELETE FROM clubs WHERE id != ${adminClubId} RETURNING name`;
    if (deleted.length > 0) {
      console.log("Clubs huérfanos eliminados:", deleted.map(c => c.name).join(", "));
    }
  } else {
    // Si el admin no tiene club, eliminamos todos (son todos de prueba)
    await sql`DELETE FROM clubs`;
    console.log("Todos los clubs eliminados (admin no tenía club_id).");
  }

  // 4. Desasociar el superadmin del club (el superadmin no debe tener club propio)
  await sql`UPDATE users SET club_id = NULL WHERE email = 'juanymolfino@hotmail.com'`;
  console.log("Superadmin desasociado del club.");

  // 5. Eliminar usuarios de DB que no son los dos conocidos
  const deleted = await sql`DELETE FROM users WHERE email NOT IN ${sql(KEEP_EMAILS)} RETURNING email`;
  if (deleted.length > 0) {
    console.log("Usuarios DB eliminados:", deleted.map(u => u.email).join(", "));
  } else {
    console.log("No había usuarios extra en DB.");
  }

  // 6. Eliminar auth users que no son los dos conocidos
  const toDeleteAuth = authUsers.filter(u => !KEEP_EMAILS.includes(u.email ?? ""));
  for (const u of toDeleteAuth) {
    const { error } = await adminAuth.auth.admin.deleteUser(u.id);
    if (error) {
      console.log(`Error eliminando auth user ${u.email}: ${error.message}`);
    } else {
      console.log(`Auth user eliminado: ${u.email}`);
    }
  }

  console.log("\n=== Estado final ===");
  const finalUsers = await sql`SELECT email, role, club_id FROM users ORDER BY created_at`;
  const finalClubs = await sql`SELECT name FROM clubs`;
  console.log("Users:", finalUsers.map(u => `${u.email} (${u.role})`).join(", "));
  console.log("Clubs:", finalClubs.map(c => c.name).join(", ") || "(ninguno)");

  const { data: finalAuth } = await adminAuth.auth.admin.listUsers({ perPage: 200 });
  console.log("Auth users:", (finalAuth?.users ?? []).map(u => u.email).join(", "));

  await sql.end();
  console.log("\n✅ Limpieza completa.");
}

run().catch(err => { console.error(err); process.exit(1); });
