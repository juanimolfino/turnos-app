# WhatsApp como canal del bot

Este documento describe la integración de WhatsApp como segundo canal del bot central. Telegram sigue funcionando y ambos canales conviven durante la fase de desarrollo.

## Objetivo

- Mantener una sola lógica de negocio en `handleIncomingMessage(IncomingMessage)`.
- Usar adaptadores por canal en `lib/bot/channels/`.
- No duplicar lógica de reservas, pagos, búsqueda ni cancelaciones dentro del webhook de WhatsApp.
- Para WhatsApp, usar el teléfono que envía Meta en `message.from` como identificador del canal y como teléfono de contacto.

## Flujo

1. Meta envía el webhook a `/api/whatsapp/webhook`.
2. El endpoint valida `X-Hub-Signature-256` con `WHATSAPP_APP_SECRET`.
3. Si el cambio es del campo `messages` y trae un mensaje de texto:
   - `channel = "whatsapp"`
   - `userId = message.from`
   - `text = message.text.body`
4. El endpoint llama a `handleIncomingMessage({ channel, userId, text })`.
5. El bot responde usando el adaptador de WhatsApp, que llama a WhatsApp Cloud API con `WHATSAPP_ACCESS_TOKEN` y `WHATSAPP_PHONE_NUMBER_ID`.

## Datos guardados

Para Telegram, se mantiene el comportamiento actual:

- `channel = "telegram"`
- `channelUserId = chat.id`
- `customers.phone` se pide por conversación.
- `bookings.customerPhone` guarda el id del canal para validar cancelaciones.

Para WhatsApp:

- `channel = "whatsapp"`
- `channelUserId = message.from`
- `customers.phone = message.from`
- `bookings.customerPhone = message.from`

Esto significa que, por ahora, una misma persona puede existir como dos identidades distintas si habló por Telegram y por WhatsApp. Es intencional para no mezclar canales durante el desarrollo.

## Conversación de reserva por WhatsApp

Como WhatsApp ya entrega el número del usuario, el bot no pide teléfono de contacto. En una reserva solo pide:

- nombre
- apellido

Si el usuario elige un turno sin identificarse, la pregunta esperada es:

> ¿A nombre de quién hago la reserva? Pasame nombre y apellido.

## Variables de entorno

Server-side solamente:

- `WHATSAPP_VERIFY_TOKEN`: token libre que usamos para validar el GET de configuración del webhook en Meta.
- `WHATSAPP_APP_SECRET`: clave secreta de la app de Meta, usada para validar la firma del webhook.
- `WHATSAPP_ACCESS_TOKEN`: token de acceso para enviar mensajes por Cloud API.
- `WHATSAPP_PHONE_NUMBER_ID`: id del número desde el que responde el bot.

No exponer ninguna de estas variables al cliente ni usar prefijo `NEXT_PUBLIC_`.

## Cuidados

- No procesar webhooks sin firma válida.
- Ignorar `statuses` para no responder a recibidos/entregados/leídos.
- Ignorar mensajes no-texto hasta diseñar soporte para audio, imagen o botones.
- Devolver 200 a Meta si falla el procesamiento interno, para evitar reintentos infinitos. El error queda en logs.
- Tener presente la ventana de atención de WhatsApp: respuestas libres funcionan dentro de la ventana de 24 horas iniciada por el cliente; fuera de esa ventana se necesitan templates aprobados.
- El token de prueba de Meta puede expirar; para producción usar token permanente/sistema según el setup de Meta Business.
- No mezclar identidades Telegram/WhatsApp todavía. Si más adelante se unifican clientes, hacerlo con una migración y reglas explícitas de merge.

## Checklist de prueba

1. Enviar un WhatsApp al número del bot.
2. Ver en logs de Vercel un POST 200 a `/api/whatsapp/webhook`.
3. Confirmar que el bot responde desde WhatsApp.
4. Pedir disponibilidad.
5. Elegir un turno.
6. Confirmar que el bot pide solo nombre y apellido.
7. Enviar nombre y apellido.
8. Confirmar que se crea la reserva con:
   - `channel = whatsapp`
   - `channel_user_id = message.from`
   - teléfono del customer igual a `message.from`

## Rollback

Si WhatsApp genera errores en producción, se puede desactivar sin tocar Telegram:

1. Quitar o desuscribir el webhook en Meta.
2. O remover temporalmente las variables `WHATSAPP_ACCESS_TOKEN` / `WHATSAPP_PHONE_NUMBER_ID` de Vercel.
3. Telegram sigue usando su adaptador y su webhook independiente.
