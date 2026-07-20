import type { Channel, ChannelAdapter, IncomingMessage } from "@/lib/bot/types";
import type { ChatTurn } from "@/lib/bot/brain";
import { telegramAdapter } from "@/lib/bot/channels/telegram";
import { whatsappAdapter } from "@/lib/bot/channels/whatsapp";
import { generarRespuesta } from "@/lib/bot/brain";
import { getHistory, appendTurns } from "@/lib/bot/memory";
import { extraerIntencion } from "@/lib/bot/intent";
import { buscarDisponibilidad } from "@/lib/bot/search";
import { redactarRespuesta } from "@/lib/bot/reply";
import { extraerAccionReserva } from "@/lib/bot/extraer-reserva";
import { crearReservaBot, resolverTurno, confirmarReservaTexto, type Turno } from "@/lib/bot/reservar";
import { extraerAccionCancelacion } from "@/lib/bot/extraer-cancelacion";
import { cancelarReservaBotPorCodigo, respuestaCancelacionTexto } from "@/lib/bot/cancelar";
import { getKnownBotCustomer } from "@/lib/db/queries";

// Registro de adaptadores por canal. Para sumar un canal nuevo (ej. WhatsApp),
// se agrega su entrada acá y un value en el type Channel; handle no cambia.
const adapters: Record<Channel, ChannelAdapter> = {
  telegram: telegramAdapter,
  whatsapp: whatsappAdapter,
};

const BOOKING_CODE_RE = /\b([A-Z]{3}[0-9]{3})\b/i;
const PHONE_RE = /(?:\+?\d[\d\s().-]{5,}\d)/;
const KNOWN_CUSTOMER_CONFIRMATION_RE = /confirm[aá]s que son correctos para reservar/i;
const AFFIRMATIVE_RE = /(^|\s)(s[ií]|dale|ok|okay|confirmo|confirmar|correcto|est[aá]\s+bien)(\s|$|[.!?])/i;
const NEGATIVE_RE = /(^|\s)(no|mal|incorrecto|incorrecta|cambiar|cambialo|cambiarlos|modificar|est[aá]\s+mal)(\s|$|[.!?])/i;

function firstName(name: string) {
  return name.trim().split(/\s+/)[0] ?? name;
}

function sanitizeText(value: string, maxLength = 90) {
  return value
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<[^>]*>/g, " ")
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/[<>{}\[\]`]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength)
    .trim();
}

function normalizePhone(value: string | null | undefined) {
  if (!value) return null;
  const cleaned = value
    .replace(/<[^>]*>/g, " ")
    .replace(/[^\d+().\-\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 40)
    .trim();
  const digits = cleaned.replace(/\D/g, "");
  if (digits.length < 6 || digits.length > 20) return null;
  return cleaned;
}

function extractPhone(text: string, fallback?: string | null) {
  return normalizePhone(fallback ?? text.match(PHONE_RE)?.[0]);
}

function contactPhoneForMessage(msg: IncomingMessage, fallback?: string | null) {
  if (msg.channel === "whatsapp") {
    return normalizePhone(msg.userId) ?? msg.userId;
  }
  return extractPhone(msg.text, fallback);
}

function bookingIdentityPrompt(msg: IncomingMessage) {
  if (msg.channel === "whatsapp") {
    return "¡Buenísimo! ¿A nombre de quién hago la reserva? Pasame nombre y apellido.";
  }
  return "¡Buenísimo! ¿A nombre de quién hago la reserva? Pasame nombre y apellido, y un teléfono de contacto.";
}

function updatedIdentityPrompt(msg: IncomingMessage) {
  if (msg.channel === "whatsapp") {
    return "No hay problema. Pasame nombre y apellido actualizados.";
  }
  return "No hay problema. Pasame nombre y apellido, y un teléfono de contacto actualizados.";
}

function cleanName(name: string | null | undefined, phone: string | null) {
  if (!name) return null;
  const sanitized = sanitizeText(name);
  const withoutPhone = phone ? sanitized.replace(phone, "") : sanitized;
  const cleaned = withoutPhone
    .replace(PHONE_RE, "")
    .replace(/\b(tel[eé]fono|tel|celular|cel|mi|es|soy|me|llamo)\b/gi, " ")
    .replace(/[:;,.-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return cleaned || null;
}

function lastAssistantMessage(history: ChatTurn[]) {
  return [...history].reverse().find((turn) => turn.role === "assistant")?.content ?? "";
}

function isConfirmingKnownCustomer(history: ChatTurn[]) {
  return KNOWN_CUSTOMER_CONFIRMATION_RE.test(lastAssistantMessage(history));
}

function confirmsKnownCustomer(text: string) {
  return AFFIRMATIVE_RE.test(text) && !NEGATIVE_RE.test(text);
}

function rejectsKnownCustomer(text: string) {
  return NEGATIVE_RE.test(text);
}

function confirmKnownCustomerText(customer: { name: string; phone: string }, turno: { clubName: string; courtName: string; startTime: string }) {
  return (
    `Tengo estos datos para reservar en ${turno.clubName} (${turno.courtName}) a las ${turno.startTime}:\n` +
    `Nombre: ${customer.name}\n` +
    `Teléfono: ${customer.phone}\n\n` +
    `¿Confirmás que son correctos para reservar? Si está bien, respondé "sí". Si querés cambiarlos, mandame nombre y teléfono nuevos.`
  );
}

async function reservarTurno(params: {
  turno: Turno;
  name: string;
  phone: string;
  msg: IncomingMessage;
  history: ChatTurn[];
  userText: string;
  intent: Awaited<ReturnType<typeof extraerIntencion>>;
  lugares: Awaited<ReturnType<typeof buscarDisponibilidad>>;
}) {
  const res = await crearReservaBot({
    clubId: params.turno.clubId,
    courtId: params.turno.courtId,
    date: params.turno.date,
    startTime: params.turno.startTime,
    endTime: params.turno.endTime,
    customerName: params.name,
    customerContactPhone: params.phone,
    channel: params.msg.channel,
    channelUserId: params.msg.userId,
  });
  if (res.ok) {
    return confirmarReservaTexto(params.turno, params.name, res);
  }
  if (res.error === "PAGO_NO_DISPONIBLE") {
    return "No pude generar el link de pago, así que liberé el turno y no quedó reservado. Probá de nuevo en unos minutos o elegí otro horario.";
  }
  return (
    "Uy, ese turno se acaba de ocupar 😕. " +
    (await redactarRespuesta({ history: params.history, userText: params.userText, intent: params.intent, lugares: params.lugares }))
  );
}

function extraerConfirmacionCancelacionSinRefund(history: ChatTurn[], userText: string): string | null {
  if (!/\b(confirmo|confirmar|s[ií]|dale|ok)\b/i.test(userText)) return null;
  const lastAssistant = [...history].reverse().find((turn) => turn.role === "assistant");
  if (!lastAssistant) return null;
  const prompt = lastAssistant.content;
  if (!/no se realiza la devoluci[oó]n/i.test(prompt) || !/confirmo/i.test(prompt)) return null;
  const codeFromUser = userText.match(BOOKING_CODE_RE)?.[1]?.toUpperCase();
  const codeFromPrompt = prompt.match(BOOKING_CODE_RE)?.[1]?.toUpperCase();
  return codeFromUser ?? codeFromPrompt ?? null;
}

// Punto de entrada agnóstico al canal. La clave separa hilos por canal+usuario
// (`telegram:12345`). Flujo:
//  1) cargar historial y extraer la intención sobre la conversación completa
//  2) si falta lo esencial (día o deporte) → repreguntar (charla natural)
//  3) si hay día + deporte → buscar disponibilidad real
//  4) ¿el usuario está reservando? (Fase 6) → pedir nombre / crear la reserva
//     (anti-doble-booking en dos capas); si no, redactar la oferta.
export async function handleIncomingMessage(msg: IncomingMessage): Promise<void> {
  console.log(`[bot] ${msg.channel}:${msg.userId} → ${msg.text}`);

  const key = `${msg.channel}:${msg.userId}`;
  const history = await getHistory(key);
  const knownCustomer = await getKnownBotCustomer(msg.channel, msg.userId).catch(() => null);
  const userTurn: ChatTurn = { role: "user", content: msg.text };
  const convo = [...history, userTurn];

  const confirmacionSinRefund = extraerConfirmacionCancelacionSinRefund(history, msg.text);
  if (confirmacionSinRefund) {
    const result = await cancelarReservaBotPorCodigo({
      bookingCode: confirmacionSinRefund,
      customerPhone: msg.userId,
      confirmCancelWithoutRefund: true,
    });
    const respuesta = respuestaCancelacionTexto(result);
    const adapter = adapters[msg.channel];
    await adapter.send(msg.userId, respuesta);
    await appendTurns(key, [userTurn, { role: "assistant", content: respuesta }]);
    return;
  }

  const accionCancelacion = extraerAccionCancelacion(convo);
  if (accionCancelacion.tipo !== "ninguna") {
    let respuesta: string;
    if (accionCancelacion.tipo === "pedir_codigo") {
      respuesta = "Pasame tu código de reserva (3 letras y 3 números, por ejemplo HYS324) y la cancelo.";
    } else if (accionCancelacion.tipo === "codigo_invalido") {
      respuesta = respuestaCancelacionTexto({ ok: false, error: "CODIGO_INVALIDO" });
    } else {
      const result = await cancelarReservaBotPorCodigo({
        bookingCode: accionCancelacion.bookingCode,
        customerPhone: msg.userId,
      });
      respuesta = respuestaCancelacionTexto(result);
    }

    const adapter = adapters[msg.channel];
    await adapter.send(msg.userId, respuesta);
    await appendTurns(key, [userTurn, { role: "assistant", content: respuesta }]);
    return;
  }

  // "Ahora": extraerIntencion lo formatea en la timezone del negocio (BA).
  const intent = await extraerIntencion(convo, new Date());

  let respuesta: string;
  if (!intent.date || !intent.sport) {
    // Falta info esencial para buscar → repreguntamos de forma natural.
    // Si ya nombró un club, preservamos esa preferencia en la repregunta.
    respuesta = knownCustomer && history.length === 0
      ? `Hola ${firstName(knownCustomer.name)}. ¿Cuándo te gustaría jugar?`
      : intent.club && !intent.date
      ? `¿Para qué día querés ver turnos en ${intent.club}?`
      : await generarRespuesta(msg.text, history);
  } else {
    const lugares = await buscarDisponibilidad(intent, msg.text);
    const accion = await extraerAccionReserva(convo, lugares);
    const turno = accion.tipo === "ninguna" ? null : resolverTurno(lugares, accion, intent.date);

    if (accion.tipo !== "ninguna" && turno) {
      const knownForThisClub = knownCustomer?.clubId === turno.clubId ? knownCustomer : null;
      const phone = contactPhoneForMessage(msg, accion.telefono);
      const name = cleanName(accion.nombre, phone);
      const confirmingKnownCustomer = isConfirmingKnownCustomer(history);
      const confirmedKnownCustomer = confirmingKnownCustomer && confirmsKnownCustomer(msg.text);
      const rejectedKnownCustomer = confirmingKnownCustomer && rejectsKnownCustomer(msg.text);

      if (knownForThisClub?.phone && confirmedKnownCustomer) {
        respuesta = await reservarTurno({
          turno,
          name: sanitizeText(knownForThisClub.name),
          phone: normalizePhone(knownForThisClub.phone) ?? knownForThisClub.phone,
          msg,
          history,
          userText: msg.text,
          intent,
          lugares,
        });
      } else if (knownForThisClub?.phone && rejectedKnownCustomer && (!name || !phone)) {
        respuesta = updatedIdentityPrompt(msg);
      } else if (knownForThisClub?.phone && !confirmingKnownCustomer && (accion.tipo === "elegir" || !name || !phone)) {
        respuesta = confirmKnownCustomerText({ name: sanitizeText(knownForThisClub.name), phone: knownForThisClub.phone }, turno);
      } else if (knownForThisClub && !knownForThisClub.phone && !phone) {
        respuesta = `Pasame un teléfono de contacto para la reserva de ${knownForThisClub.name}.`;
      } else if (accion.tipo === "elegir" || !name) {
        // Eligió un turno pero falta identificar al cliente.
        respuesta = bookingIdentityPrompt(msg);
      } else if (!phone) {
        respuesta = `Pasame un teléfono de contacto para la reserva de ${name}.`;
      } else {
        // Eligió + dio datos → reservar. El id del canal se conserva para seguridad de cancelación.
        respuesta = await reservarTurno({ turno, name, phone, msg, history, userText: msg.text, intent, lugares });
      }
    } else {
      // Sigue explorando → redactamos la oferta sobre los datos reales.
      respuesta = await redactarRespuesta({ history, userText: msg.text, intent, lugares });
    }
  }

  const adapter = adapters[msg.channel];
  await adapter.send(msg.userId, respuesta);

  await appendTurns(key, [userTurn, { role: "assistant", content: respuesta }]);
}
