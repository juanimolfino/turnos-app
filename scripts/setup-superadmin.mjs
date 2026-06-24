import { createClient } from "@supabase/supabase-js";
import postgres from "postgres";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const DATABASE_URL = process.env.DATABASE_URL;

const EMAIL = "juanymolfino@hotmail.com";
const PASSWORD = "PadelAdmin2026!";

if (!SUPABASE_URL || !SERVICE_ROLE_KEY || !DATABASE_URL) {
  console.error("Faltan variables de entorno. Asegurate de tener .env.local con NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY y DATABASE_URL.");
  process.exit(1);
}

const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false }
});

const sql = postgres(DATABASE_URL);

async function run() {
  console.log(`Creando usuario ${EMAIL}...`);

  const { data, error } = await admin.auth.admin.createUser({
    email: EMAIL,
    password: PASSWORD,
    email_confirm: true,
    user_metadata: { invited_role: "superadmin" }
  });

  if (error) {
    if (error.message.includes("already registered")) {
      console.log("Usuario ya existe en Supabase Auth, actualizando rol en DB...");
      const { data: existing } = await admin.auth.admin.listUsers();
      const user = existing?.users?.find(u => u.email === EMAIL);
      if (!user) {
        console.error("No se encontró el usuario.");
        process.exit(1);
      }

      await sql`
        INSERT INTO users (auth_user_id, email, role)
        VALUES (${user.id}, ${EMAIL}, 'superadmin')
        ON CONFLICT (auth_user_id) DO UPDATE SET role = 'superadmin', updated_at = NOW()
      `;
      console.log("✓ Rol superadmin actualizado en DB.");
    } else {
      console.error("Error al crear usuario:", error.message);
      process.exit(1);
    }
  } else {
    const authUserId = data.user.id;
    await sql`
      INSERT INTO users (auth_user_id, email, role)
      VALUES (${authUserId}, ${EMAIL}, 'superadmin')
      ON CONFLICT (auth_user_id) DO UPDATE SET role = 'superadmin', updated_at = NOW()
    `;
    console.log("✓ Usuario creado en Supabase Auth.");
    console.log("✓ Perfil creado en DB con rol superadmin.");
  }

  await sql.end();
  console.log(`\n✅ Listo. Podés ingresar con:\n   Email: ${EMAIL}\n   Contraseña: ${PASSWORD}`);
}

run().catch(err => {
  console.error(err);
  process.exit(1);
});
