import { describe, expect, it, vi, beforeEach } from "vitest";

// Espiamos el adaptador de Telegram para verificar la salida sin tocar la red.
const send = vi.fn();
vi.mock("@/lib/bot/channels/telegram", () => ({
  telegramAdapter: { send: (...args: unknown[]) => send(...args) },
}));

import { handleIncomingMessage } from "@/lib/bot/handle";

describe("handleIncomingMessage", () => {
  beforeEach(() => send.mockReset());

  it("responde un eco usando el adaptador del canal", async () => {
    await handleIncomingMessage({ channel: "telegram", userId: "123", text: "hola" });
    expect(send).toHaveBeenCalledTimes(1);
    expect(send).toHaveBeenCalledWith("123", "Echo: hola");
  });

  it("preserva el userId del canal (chat.id como string)", async () => {
    await handleIncomingMessage({ channel: "telegram", userId: "999", text: "x" });
    expect(send).toHaveBeenCalledWith("999", "Echo: x");
  });
});
