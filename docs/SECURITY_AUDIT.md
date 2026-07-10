# Auditoría de seguridad — Cancha

> Fecha: 2026-07-09 · Alcance: rama `feat/superadmin-delete-admin` (borrado de admins) +
> barrido general de los flujos sensibles (auth, roles, pagos Mercado Pago, webhooks, API pública).
>
> Cada hallazgo tiene **prioridad**, **problema** y **fix a aplicar**. Ordenado de más grave a menos.
> Lo marcado como "preexistente" no lo introdujo esta rama, pero entra en el pedido de "que la app
> sea lo más segura posible y no haya problemas de plata o base de datos", así que va documentado.

---

## 🔴🔴 P-1 — CRÍTICO MÁXIMO · Base de datos entera LEÍBLE Y ESCRIBIBLE con la anon key pública

**Estado:** ✅ **FIXEADO EN VIVO (2026-07-09).** Era una **fuga activa**, no teórica.

### Problema
**RLS estaba OFF en las 19 tablas** de `public` y los roles `anon`/`authenticated` tenían grants. La
anon key (`NEXT_PUBLIC_SUPABASE_ANON_KEY`) es **pública** (va en el bundle JS de todo browser). Se
confirmó por REST (`/rest/v1/<tabla>`) que **cualquiera** con esa key podía:
- **LEER** todo: `club_mercadopago_credentials` (**access_token + refresh_token de MP de cada club**),
  `customers` (PII: nombre/tel/email), `bookings`, `users` (emails y roles), `admin_invitations`.
- **ESCRIBIR/BORRAR** todo: `PATCH`/`DELETE` sobre `bookings`, `customers`, etc. devolvían **HTTP 204**.

Impacto: robo de los tokens de Mercado Pago (cobrar/reembolsar a nombre de los clubs), robo masivo de
PII, y manipulación/borrado de cualquier reserva o credencial. Es el peor hallazgo posible.

### Causa
`lib/db/rls.sql` (histórico) solo activaba RLS en 5 tablas legacy y **nunca se corrió** en producción;
las tablas de Cancha se crearon por migraciones Drizzle, que **no activan RLS** por defecto, y Supabase
concede grants a `anon`/`authenticated` en el esquema `public`.

### Fix aplicado
Se activó **RLS en las 19 tablas** + `REVOKE ALL ... FROM anon, authenticated` (deny-by-default). La app
no se rompe: el runtime usa Drizzle (rol owner `postgres`, **bypassea RLS**) y el service_role también.
Verificado post-fix: la app sigue leyendo (`clubs=5`, `mp_creds=2`) y la anon key ahora recibe
**HTTP 401 permission denied** en lectura y escritura. El SQL reproducible quedó en `lib/db/rls.sql`.

### Pendiente asociado (manual)
- Como esto estuvo abierto un tiempo, **asumir los tokens de MP y toda credencial como potencialmente
  comprometidos**: rotar `MERCADOPAGO_*`, y que cada club reconecte MP (nuevo token) por las dudas.
- Revisar en el dashboard de MP de cada club si hubo movimientos/refunds no reconocidos.

---

## ⚡ Actualización 2026-07-09 — segunda pasada (verificación + fixes aplicados)

La primera pasada fue estática y dejó ítems sin verificar por falta de acceso. En esta segunda pasada
se **confirmó la explotabilidad**, se **aplicaron los fixes de código** y se completó el barrido (DB,
inyecciones, IDOR, pagos, headers). Resumen de cambios de esta pasada:

**Confirmado explotable HOY (no era bomba latente):**
- `GET {SUPABASE_URL}/auth/v1/settings` devuelve **`"disable_signup": false`** → **los signups están
  ABIERTOS**. Combinado con P0 (rol desde `user_metadata`), la escalada a superadmin es explotable ya.
  (`"mailer_autoconfirm": false` es lo único que hoy agrega fricción: exige confirmar el email.)

**Hallazgo nuevo (CRÍTICO) — P0.2: cualquier usuario registrado podía entrar al panel de admin.**
El layout `app/(app)/layout.tsx` solo redirigía a superadmin y a los sin-perfil; **no exigía
`role === "admin"`**. Un usuario auto-registrado queda con `role: null` pero con perfil, así que
accedía al panel. Peor: `POST /api/auth/onboarding` dejaba que **cualquier** usuario autenticado se
**creara un club** (`setOnboardingClubName`), auto-proveyéndose como admin de hecho. Cadena completa:
signup abierto → confirmar email → `POST /api/auth/onboarding {clubName}` → club propio + acceso al panel.

**Fixes de código aplicados en esta pasada:**
1. `lib/db/queries.ts` · `ensureUserProfile` → **ya no deriva `role`/`clubId`/`venueName` de
   `user_metadata`**; crea siempre perfil sin privilegios (`null`). El rol legítimo lo asigna solo
   `acceptAdminInvitation` (token firmado, server-side). **Cierra P0 y la auto-reversión de P1.**
2. `app/(app)/layout.tsx` → **exige `role === "admin"`** para entrar al panel. **Cierra P0.2 (acceso).**
3. `app/api/auth/onboarding/route.ts` → **exige `role === "admin"`** antes de crear/nombrar el club.
   **Cierra P0.2 (auto-provisión de club).**
4. `app/api/admin/[id]/route.ts` → si falla el borrado en Supabase Auth, **devuelve 502 con
   `partial: true`** en vez de un `ok:true` engañoso. **Cierra P1 (fallo tragado).**
5. `next.config.ts` → **headers de seguridad** (`frame-ancestors 'none'` + `X-Frame-Options: DENY`,
   `nosniff`, HSTS, `Referrer-Policy`, `Permissions-Policy`). **Cierra el hardening de headers.**

**Barrido adicional — sin hallazgos explotables (sano):**
- **Inyección SQL:** todo pasa por Drizzle parametrizado. Los `sql\`...\`` y `db.execute(sql\`...\`)`
  usan bindings (`${pattern}`, `${playerIdentityId}`, refs de columna), sin concatenar input crudo. Limpio.
- **XSS / RCE:** sin `dangerouslySetInnerHTML`, `eval`, `new Function` ni `child_process`. React auto-escapa.
- **IDOR:** las mutaciones scopean por dueño: `updateManualCustomer`/`deleteManualCustomer` filtran por
  `and(id, clubId)`; `deleteAgendaBlock`/`deleteAgendaBlockGroup` por `clubId`; el endpoint nuevo
  `GET /api/onboarding/status` y `/pagos` scopean por el `clubId` del perfil; `/superadmin/pagos` está
  bajo el layout que exige `role === "superadmin"`. Sin IDOR.
- **P2.1 (rate-limit cancelación) → DOWNGRADE a LOW:** el gate de cancelación exige que
  `customer_phone` (snapshot) coincida con el **userId del canal** del que escribe. Ese userId **no es
  atacante-controlable** (lo pone Telegram, no el mensaje). Así, adivinar `booking_code` solo permite
  cancelar reservas hechas **bajo el propio userId** del atacante. El brute-force no sirve para cancelar
  reservas ajenas → no se agrega rate-limit por ahora (evita tocar el flujo del bot por bajo beneficio).

Verificación: `tsc` limpio y **284 tests en verde** (se actualizó el test de admin-delete que codificaba
el `ok:true` vulnerable). Ver el detalle original de cada hallazgo abajo.

---

## P0 — CRÍTICO · Escalada de privilegios a superadmin vía `user_metadata`

**Estado:** ✅ **FIXEADO EN CÓDIGO** (2026-07-09). Confirmado **explotable** (signups abiertos).
`ensureUserProfile` ya no lee el rol del `user_metadata`. **Falta la acción manual:** deshabilitar
signups en Supabase (ver Pendientes). Preexistente; no lo introdujo la rama de borrado.
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

**Estado:** ✅ **FIXEADO EN CÓDIGO** (2026-07-09). El endpoint ahora devuelve 502/`partial` si falla el
borrado de Auth, y el fix de P0 elimina la auto-reversión (ya no se reconstruye el rol desde metadata).
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

| Prio | Problema | Riesgo | Estado |
|------|----------|--------|--------|
| **P-1** | RLS OFF en las 19 tablas → anon key pública lee/escribe TODA la base (incl. tokens MP, PII) | Robo de tokens de pago + PII + manipulación total | ✅ **Fixeado en vivo** (RLS + revoke) · ⚠️ rotar tokens MP |
| **P0** | Rol de superadmin asignable desde `user_metadata` (cliente) | Toma total: borrar clubs, ver/tocar todo, pagos | ✅ Código fixeado · ⚠️ falta deshabilitar signups |
| **P0.2** | El panel de admin no exigía `role==="admin"` + `/api/auth/onboarding` abierto → auto-provisión de club | Cualquier registrado entra al panel y se hace admin | ✅ Código fixeado (layout + endpoint) |
| **P1** | Borrado de admin DB-first con fallo de Auth tragado + auto-reversión | Un admin echado recupera acceso | ✅ Código fixeado (502/partial + fix P0) |
| **P2.2** | Refresh del `access_token` de MP (180 días) | Cobros de un club se cortan | 🟡 Follow-up |
| **P2.1** | Rate-limit en cancelación por `booking_code` | Bajo (gate = userId del canal, no adivinable) | ⬇️ Downgrade a LOW, sin acción |

**Prioridad restante:** la única acción crítica pendiente es **manual** — deshabilitar signups y auditar
RLS en Supabase (ver Pendientes). Todo el resto quedó fixeado en código en esta pasada.

---

## Pendientes de análisis — estado tras la segunda pasada

### ✅ Verificado / hecho en código
- [x] **Signups habilitados en Supabase** → CONFIRMADO **abiertos** (`disable_signup: false`). P0 era
      explotable hoy. (El código ya no confía en `user_metadata`; ver abajo la acción manual restante.)
- [x] **Confirmación de email obligatoria** → CONFIRMADA activa (`mailer_autoconfirm: false`): es la
      única fricción que hoy frena un signup automatizado. **No la desactives.**
- [x] **Inyección SQL / IDOR / XSS** → barrido completo, sin hallazgos explotables (ver "segunda pasada").
- [x] **Fixes de código P0, P0.2, P1 + headers** → aplicados.
- [x] **RLS de TODAS las tablas** → estaba OFF con acceso anon total (P-1); **fixeado en vivo** (RLS on +
      revoke). Verificado bloqueado (401). SQL reproducible en `lib/db/rls.sql`.
- [x] **Superadmins en la base** → hay **2**: `juanymolfino@hotmail.com` (24/06) y
      `kevinnkroll@gmail.com` (30/06). ⚠️ **CONFIRMAR que Kevin sos vos / tu socio.** Si no lo reconocés,
      es intrusión (los signups estaban abiertos y P0 explotable): borralo y rotá todo.

### 🔴 Acciones manuales que TENÉS que hacer (el código no las puede hacer)
- [ ] **CRÍTICO — Deshabilitar signups públicos** en Supabase: Authentication → Providers → "Allow new
      users to sign up" **en OFF**. Todo el alta de admins es por invitación, no se pierde nada. Es la
      barrera definitiva de P0 (el fix de código ya evita la escalada, pero cerrar signups reduce la
      superficie: nadie ajeno debería poder crear una cuenta Auth).
- [ ] **CRÍTICO — Confirmar el 2º superadmin** `kevinnkroll@gmail.com` (creado 30/06). Si es tu socio,
      OK. Si NO lo reconocés → intrusión vía P0: borralo (`DELETE FROM users WHERE email='...'` + borrar
      su usuario de Auth) y tratá TODO como comprometido.
- [ ] **CRÍTICO — Rotar credenciales de Mercado Pago** y que cada club **reconecte MP**: como los tokens
      de `club_mercadopago_credentials` fueron world-readable (P-1), asumir que pudieron leerse. Rotar
      `MERCADOPAGO_CLIENT_SECRET`/`MERCADOPAGO_ACCESS_TOKEN`/`MERCADOPAGO_WEBHOOK_SECRET` y revisar el
      dashboard de MP de cada club por movimientos/refunds no reconocidos.
- [ ] **Rotar el resto de secretos** que hayan pasado por chat/logs/entornos: `SUPABASE_SERVICE_ROLE_KEY`,
      `TELEGRAM_WEBHOOK_SECRET`. Rotar **invalida** la vieja; un secreto expuesto no se "borra".
      (La anon key también estuvo sobreexpuesta, pero con RLS activa ya no da acceso; rotarla igual es opcional.)
- [x] **Auditar RLS** → HECHO en vivo (ver P-1). Ya no hace falta correrlo a mano, pero para re-verificar:
      `SELECT tablename FROM pg_tables WHERE schemaname='public' AND rowsecurity=false;` debe dar 0 filas.

### 🟡 Follow-up (no bloqueante)
- [ ] **P2.2 — Refresh del `access_token` de Mercado Pago** (vence a 180 días): usar el `refresh_token`
      guardado para renovar antes del vencimiento. Operativo, no seguridad directa.
- [ ] **Probar el webhook de MP con firmas reales** (sandbox) para validar el HMAC end-to-end.
- [ ] **Pentest dinámico** del entorno productivo (fuera del alcance de esta revisión estática).
