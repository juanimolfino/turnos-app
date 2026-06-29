import type { Channel, ChannelAdapter, IncomingMessage } from "@/lib/bot/types";
import type { ChatTurn } from "@/lib/bot/brain";
import { telegramAdapter } from "@/lib/bot/channels/telegram";
import { generarRespuesta } from "@/lib/bot/brain";
import { getHistory, appendTurns } from "@/lib/bot/memory";
import { extraerIntencion } from "@/lib/bot/intent";
import { buscarDisponibilidad } from "@/lib/bot/search";
import { redactarRespuesta } from "@/lib/bot/reply";
import { extraerAccionReserva } from "@/lib/bot/extraer-reserva";
import { crearReservaBot, resolverTurno, confirmarReservaTexto } from "@/lib/bot/reservar";
import { extraerAccionCancelacion } from "@/lib/bot/extraer-cancelacion";
import { cancelarReservaBotPorCodigo, respuestaCancelacionTexto } from "@/lib/bot/cancelar";

// Registro de adaptadores por canal. Para sumar un canal nuevo (ej. WhatsApp),
// se agrega su entrada acá y un value en el type Channel; handle no cambia.
const adapters: Record<Channel, ChannelAdapter> = {
  telegram: telegramAdapter,
};

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
  const userTurn: ChatTurn = { role: "user", content: msg.text };
  const convo = [...history, userTurn];

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
    respuesta = await generarRespuesta(msg.text, history);
  } else {
    const lugares = await buscarDisponibilidad(intent, msg.text);
    const accion = await extraerAccionReserva(convo, lugares);
    const turno = accion.tipo === "ninguna" ? null : resolverTurno(lugares, accion, intent.date);

    if (accion.tipo !== "ninguna" && turno) {
      if (accion.tipo === "elegir" || !accion.nombre) {
        // Eligió un turno pero falta el nombre.
        respuesta = "¡Buenísimo! ¿A nombre de quién hago la reserva? (nombre y apellido)";
      } else {
        // Eligió + dio nombre → reservar (capa B + capa A). Teléfono = id del canal.
        const res = await crearReservaBot({
          clubId: turno.clubId,
          courtId: turno.courtId,
          date: turno.date,
          startTime: turno.startTime,
          endTime: turno.endTime,
          customerName: accion.nombre,
          customerPhone: msg.userId,
        });
        respuesta = res.ok
          ? confirmarReservaTexto(turno, accion.nombre, res)
          : "Uy, ese turno se acaba de ocupar 😕. " +
            (await redactarRespuesta({ history, userText: msg.text, intent, lugares }));
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
