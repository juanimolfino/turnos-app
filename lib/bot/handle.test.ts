import { describe, expect, it, vi, beforeEach } from "vitest";

// Espiamos adaptador, cerebro y memoria: verificamos el cableado sin tocar red,
// OpenAI ni base de datos.
const send = vi.fn();
vi.mock("@/lib/bot/channels/telegram", () => ({
  telegramAdapter: { send: (...args: unknown[]) => send(...args) },
}));

const generarRespuesta = vi.fn();
vi.mock("@/lib/bot/brain", () => ({
  generarRespuesta: (...args: unknown[]) => generarRespuesta(...args),
}));

const getHistory = vi.fn();
const appendTurns = vi.fn();
vi.mock("@/lib/bot/memory", () => ({
  getHistory: (...args: unknown[]) => getHistory(...args),
  appendTurns: (...args: unknown[]) => appendTurns(...args),
}));

import { handleIncomingMessage } from "@/lib/bot/handle";

describe("handleIncomingMessage", () => {
  beforeEach(() => {
    send.mockReset();
    generarRespuesta.mockReset();
    getHistory.mockReset();
    appendTurns.mockReset();
    getHistory.mockResolvedValue([]);
    appendTurns.mockResolvedValue(undefined);
  });

  it("carga el historial, lo pasa al cerebro, responde y guarda ambos turnos", async () => {
    const history = [{ role: "user", content: "previo" }];
    getHistory.mockResolvedValue(history);
    generarRespuesta.mockResolvedValue("¿Para qué día buscás?");

    await handleIncomingMessage({ channel: "telegram", userId: "123", text: "hola" });

    expect(getHistory).toHaveBeenCalledWith("telegram:123");
    expect(generarRespuesta).toHaveBeenCalledWith("hola", history);
    expect(send).toHaveBeenCalledWith("123", "¿Para qué día buscás?");
    expect(appendTurns).toHaveBeenCalledWith("telegram:123", [
      { role: "user", content: "hola" },
      { role: "assistant", content: "¿Para qué día buscás?" },
    ]);
  });

  it("usa una clave separada por canal+usuario", async () => {
    generarRespuesta.mockResolvedValue("ok");
    await handleIncomingMessage({ channel: "telegram", userId: "999", text: "x" });

    expect(getHistory).toHaveBeenCalledWith("telegram:999");
    expect(send).toHaveBeenCalledWith("999", "ok");
  });
});
