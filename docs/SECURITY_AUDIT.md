# Auditoría de seguridad — Cancha

> Fecha: 2026-07-09 · Alcance: rama `feat/superadmin-delete-admin` (borrado de admins) +
> barrido general de los flujos sensibles (auth, roles, pagos Mercado Pago, webhooks, API pública).
>
> Cada hallazgo tiene **prioridad**, **problema** y **fix a aplicar**. Ordenado de más grave a menos.
> Lo marcado como "preexistente" no lo introdujo esta rama, pero entra en el pedido de "que la app
> sea lo más segura posible y no haya problemas de plata o base de datos", así que va documentado.

---

## P0 — CRÍTICO · Escalada de privilegios a superadmin vía `user_metadata`

**Estado:** preexistente (no lo introduce esta rama, pero la potencia — ver P1).
**Archivos:** `lib/db/queries.ts` (`ensureUserProfile`, líneas ~120-145),
`app/(auth)/callback/route.ts`, `app/api/auth/ensure-profile/route.ts`.

### Problema
`ensureUserProfile()` crea el perfil interno (`public.users`) tomando el **rol** desde
`authUser.user_metadata.invited_role`:

```ts
const invitedRole = authUser.user_metadata?.invited_role as Role | undefined;
// ...
role: invitedRole ?? null,
```

En Supabase, `user_metadata` (a.k.a. `raw_user_meta_data`) **es escribible por el propio usuario**
desde el cliente, con la anon key pública (`NEXT_PUBLIC_SUPABASE_ANON_KEY`), vía
`supabase.auth.signUp({ options: { data: {...} } })` o `supabase.auth.updateUser({ data: {...} })`.
Solo `app_metadata` es de escritura exclusiva del service role. Acá se confía en el campo equivocado.

El perfil se materializa en el primer login (el callback llama a `ensureUserProfile`), y también
existe el endpoint abierto `POST /api/auth/ensure-profile` que lo dispara para cualquier sesión
autenticada.

### Escenario de explotación
Si el proyecto de Supabase tiene **signups habilitados** (config del panel de Supabase, no del
código):
1. El atacante hace, contra la API de Supabase con la anon key pública:
   `supabase.auth.signUp({ email, password, options: { data: { invited_role: "superadmin" } } })`.
2. Confirma el email (o entra directo si la confirmación está desactivada).
3. Al loguearse, el callback llama a `ensureUserProfile`, que crea un `public.users` con
   `role: "superadmin"` tomado del metadata que el atacante mismo puso.
4. Ahora es **superadmin**: puede invitar/borrar admins, **borrar todos los clubs** (con el borrado
   en cascada de esta misma rama), ver toda la data y tocar la configuración de pagos.

La escalada requiere una cuenta de Auth **sin** perfil todavía (una cuenta recién registrada); un
admin ya existente no puede reescalarse por esta vía porque `ensureUserProfile` corta con
`if (existing) return existing`. Por eso el gatillo es "signup abierto". Aunque hoy los signups
estén deshabilitados, es una **bomba latente**: el día que alguien los active (o aparezca otra forma
de crear una cuenta Auth sin perfil), es game over.

### Fix a aplicar
1. **No derivar el rol desde `user_metadata`.** El rol solo debe asignarse server-side en el flujo de
   invitación (`acceptAdminInvitation`, que ya valida el token firmado). En `ensureUserProfile`,
   crear el perfil siempre con `role: null` y `clubId: null` para logins que no vengan de una
   invitación aceptada; nunca leer `invited_role`/`club_id` del metadata del cliente.
2. **Deshabilitar signups públicos** en el panel de Supabase (Authentication → Providers → “Allow new
   users to sign up” en off). El alta de admins es 100% por invitación, así que no se pierde nada.
3. Si en el futuro se necesita un claim de rol en el token, usar **`app_metadata`** (solo escribible
   por service role), nunca `user_metadata`.
4. Defensa en profundidad: agregar un check que impida que `ensureUserProfile` cree un `superadmin`
   salvo por un camino explícito y auditable.

---

## P1 — ALTO · El borrado de admin puede quedar a medias y ser revertido por el propio admin

**Estado:** introducido por esta rama.
**Archivos:** `app/api/admin/[id]/route.ts` (líneas 22-31), `lib/db/queries.ts` (`deleteAdminCascade`).

### Problema
El borrado es **primero DB, después Auth**, y si falla el borrado en Supabase Auth se **traga el
error**: loguea un `console.warn` y devuelve igual `{ ok: true }` (comportamiento fijado incluso por
un test). El usuario de Auth borrado a medias:
- conserva credenciales válidas para loguearse, y
- conserva `user_metadata.invited_role = "admin"` (lo setea `accept-invite`).

Combinado con **P0**, al loguearse dispara `ensureUserProfile` (o `POST /api/auth/ensure-profile`),
que le **reconstruye el perfil con `role: "admin"`** desde ese metadata. Es decir: un fallo transitorio
de la API de Auth (outage, timeout, key rotada) convierte una baja "permanente" en una que el admin
despedido puede revertir solo — mientras al superadmin se le mostró "borrado con éxito".

### Escenario de explotación
Un superadmin echa a un admin conflictivo y lo borra desde el panel. Justo la llamada
`admin.deleteUser` falla (Auth caído/timeout). La UI dice "listo" y el admin desaparece de la tabla.
Más tarde el admin echado se loguea con sus credenciales (siguen vivas), la app llama
`ensure-profile`, y su perfil renace como `admin`, recuperando acceso al panel de su club.

### Fix a aplicar
1. Tratar el fallo de Auth como **fallo de la operación**: borrar/banear el usuario de Auth **antes**
   (o dentro de un flujo compensatorio con) la transacción de DB. Si `authErr` no es null, devolver
   un status **no-200** que refleje el estado parcial, para que el superadmin sepa que el usuario de
   Auth sigue vivo y reintente.
2. Aplicar el fix de P0 (no reconstruir roles desde `user_metadata`) elimina la parte de
   "auto-reversión" de este bug aunque el borrado de Auth falle.
3. (Opcional) Guardar el `email`/`authUserId` de bajas fallidas para reintento manual/automático.

---

## P2 — MEDIO/HARDENING · Endurecimientos recomendados (no explotables hoy, pero valen)

Estos NO son vulnerabilidades explotables confirmadas; son mejoras de defensa en profundidad
alrededor de los flujos de plata y data.

### P2.1 — Rate limit anti-fuerza-bruta en cancelación por `booking_code`
Ya está anotado en `docs/PENDIENTES.md`. El `booking_code` (3 letras + 3 números ≈ 17M combinaciones)
es adivinable; hoy lo protege que además exige el teléfono del canal, pero no hay límite de intentos.
**Fix:** rate limit por `channel:userId` + alerta ante muchos `NO_ENCONTRADA` seguidos. Va antes de
abrir a público amplio.

### P2.2 — Refresh del `access_token` de Mercado Pago (vencimiento a 180 días)
Ya anotado en `docs/PENDIENTES.md`. No es un problema de seguridad directo, pero si el token vence sin
renovarse, los cobros de un club dejan de funcionar de golpe. **Fix:** usar el `refresh_token` guardado
para renovar antes del vencimiento y actualizar `club_mercadopago_credentials`.

### P2.3 — Confirmar configuración server-side de Supabase
Revisar en el panel de Supabase, porque el código no lo puede garantizar:
- **Signups deshabilitados** (crítico para cerrar P0).
- **RLS activo** en todas las tablas de `public` (el runtime usa service role, pero RLS es la última
  red si algo consulta con la anon key).
- Confirmación de email **obligatoria**.

---

## Lo que se revisó y está BIEN (sano)

- **Webhook de Mercado Pago** (`app/api/mercadopago/webhook/route.ts`): valida firma HMAC-SHA256 con
  comparación en **tiempo constante** (`timingSafeEqual`), verifica `external_reference`, consulta el
  pago real con el token del club, confirma solo holds vigentes y es **idempotente** por
  `mp_payment_id` (único). Los tokens de MP nunca se devuelven ni se loguean.
- **Webhook de Telegram** (`app/api/telegram/route.ts`): valida el secret token en tiempo constante.
- **API pública de disponibilidad** (`app/api/public/availability/route.ts`): todas las queries pasan
  por Drizzle parametrizado (incluido el `ilike` de ciudad) — sin SQL injection. No expone tokens.
- **`GET/POST /api/clubs/settings`**: `publicClubSettings()` excluye deliberadamente los tokens de MP;
  valida entrada con Zod; exige MP conectado antes de activar pago online.
- **OAuth callback de MP** (`app/api/mercadopago/oauth/callback/route.ts`): valida el `state` (anti-CSRF)
  contra la cookie, canjea el `code` server-side y resuelve el club desde la sesión.
- **`DELETE /api/admin/[id]`** (esta rama): correctamente exige superadmin, bloquea el auto-borrado y
  (en la capa DB) el borrado de otro superadmin; el `id` solo entra a queries parametrizadas; la
  cascada no se puede apuntar a un club que el admin no posee; las respuestas no filtran datos
  sensibles. El único pero es P1 (orden DB→Auth y fallo tragado).

---

## Resumen ejecutivo

| Prio | Problema | Riesgo | Acción |
|------|----------|--------|--------|
| **P0** | Rol de superadmin asignable desde `user_metadata` (cliente) | Toma total: borrar clubs, ver/tocar todo, pagos | No leer rol de metadata + deshabilitar signups |
| **P1** | Borrado de admin DB-first con fallo de Auth tragado + auto-reversión | Un admin echado recupera acceso | Fallar la operación si Auth no borra + fix P0 |
| **P2** | Hardening (rate-limit cancelación, refresh token MP, config Supabase) | Bajo/medio | Ver detalle arriba |

**Prioridad de arreglo:** P0 primero (cierra la escalada y la mitad de P1), luego P1, luego P2.
