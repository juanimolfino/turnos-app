import { describe, expect, it, vi, beforeEach } from "vitest";

// Espiamos el adaptador de Telegram y el cerebro: verificamos el cableado sin
// tocar la red ni la API de OpenAI.
const send = vi.fn();
vi.mock("@/lib/bot/channels/telegram", () => ({
  telegramAdapter: { send: (...args: unknown[]) => send(...args) },
}));

const generarRespuesta = vi.fn();
vi.mock("@/lib/bot/brain", () => ({
  generarRespuesta: (...args: unknown[]) => generarRespuesta(...args),
}));

import { handleIncomingMessage } from "@/lib/bot/handle";

describe("handleIncomingMessage", () => {
  beforeEach(() => {
    send.mockReset();
    generarRespuesta.mockReset();
  });

  it("envía por el adaptador lo que devuelve el cerebro", async () => {
    generarRespuesta.mockResolvedValue("¿Para qué día buscás?");
    await handleIncomingMessage({ channel: "telegram", userId: "123", text: "hola" });

    expect(generarRespuesta).toHaveBeenCalledWith("hola");
    expect(send).toHaveBeenCalledTimes(1);
    expect(send).toHaveBeenCalledWith("123", "¿Para qué día buscás?");
  });

  it("preserva el userId del canal (chat.id como string)", async () => {
    generarRespuesta.mockResolvedValue("ok");
    await handleIncomingMessage({ channel: "telegram", userId: "999", text: "x" });
    expect(send).toHaveBeenCalledWith("999", "ok");
  });
});
