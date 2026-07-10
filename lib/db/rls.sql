-- ============================================================================
-- Row Level Security (RLS) — Cancha
-- ============================================================================
-- CONTEXTO DE SEGURIDAD (leer antes de tocar):
-- La app NUNCA lee/escribe datos con la anon key vía PostgREST. TODO el acceso a
-- datos va por Drizzle (rol `postgres`/owner, que BYPASSEA RLS) o por el
-- service_role (getSupabaseAdmin, también bypassea RLS). La anon key
-- (NEXT_PUBLIC_SUPABASE_ANON_KEY) es pública y solo se usa para Auth (GoTrue),
-- no para leer tablas.
--
-- Por eso el modelo correcto acá es DENY-BY-DEFAULT: activar RLS en TODAS las
-- tablas y NO crear políticas permisivas para anon/authenticated. Con RLS activa
-- y sin política, PostgREST le niega todo a la anon key; el runtime (owner) y el
-- service_role siguen funcionando sin cambios.
--
-- HISTÓRICO (2026-07-09): antes este archivo solo cubría 5 tablas legacy y en
-- producción RLS estaba OFF en TODAS las tablas, con grants a anon/authenticated
-- → la anon key podía LEER Y ESCRIBIR toda la base (incluidos los tokens de
-- Mercado Pago de cada club y la PII de clientes). Se corrigió activando RLS +
-- revocando grants en las 19 tablas. Correr esto es idempotente y reproducible.
-- ============================================================================

do $$
declare t text;
begin
  for t in
    select tablename from pg_tables where schemaname = 'public'
  loop
    execute format('alter table public.%I enable row level security;', t);
    -- Defensa extra: quitar cualquier privilegio directo de los roles públicos.
    execute format('revoke all on public.%I from anon, authenticated;', t);
  end loop;
end $$;

-- Verificación (debería devolver 0 filas):
--   select tablename from pg_tables where schemaname='public' and rowsecurity = false;
--
-- Verificación de que la app sigue leyendo (por DATABASE_URL, rol owner):
--   select count(*) from clubs;   -- funciona (owner bypassea RLS)
--
-- Verificación de que la anon key queda bloqueada (REST):
--   curl "$SUPABASE_URL/rest/v1/clubs?select=*" -H "apikey: $ANON_KEY"  -> 401 permission denied
