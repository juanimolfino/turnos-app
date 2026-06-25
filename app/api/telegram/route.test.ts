import { describe, expect, it, vi, beforeEach } from "vitest";
import type { NextRequest } from "next/server";

const handleIncomingMessage = vi.fn();
vi.mock("@/lib/bot/handle", () => ({
  handleIncomingMessage: (...args: unknown[]) => handleIncomingMessage(...args),
}));

import { POST } from "@/app/api/telegram/route";

const SECRET = "telesecret";

function req(body: unknown, secret: string | null): NextRequest {
  const headers = new Headers({ "Content-Type": "application/json" });
  if (secret !== null) headers.set("X-Telegram-Bot-Api-Secret-Token", secret);
  return new Request("https://app.test/api/telegram", {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  }) as unknown as NextRequest;
}

describe("POST /api/telegram", () => {
  beforeEach(() => {
    process.env.TELEGRAM_WEBHOOK_SECRET = SECRET;
    handleIncomingMessage.mockReset();
    handleIncomingMessage.mockResolvedValue(undefined);
  });

  it("devuelve 401 si falta el header del secret", async () => {
    const res = await POST(req({ message: { chat: { id: 1 }, text: "hola" } }, null));
    expect(res.status).toBe(401);
    expect(handleIncomingMessage).not.toHaveBeenCalled();
  });

  it("devuelve 401 si el secret no coincide", async () => {
    const res = await POST(req({ message: { chat: { id: 1 }, text: "hola" } }, "mal"));
    expect(res.status).toBe(401);
    expect(handleIncomingMessage).not.toHaveBeenCalled();
  });

  it("espera el procesamiento y devuelve 200 con un mensaje de texto válido", async () => {
    const res = await POST(req({ message: { chat: { id: 42 }, text: "hola" } }, SECRET));
    expect(res.status).toBe(200);
    expect(handleIncomingMessage).toHaveBeenCalledWith({
      channel: "telegram",
      userId: "42",
      text: "hola",
    });
  });

  it("devuelve 200 aunque el procesamiento falle (no reintentos de Telegram)", async () => {
    handleIncomingMessage.mockRejectedValueOnce(new Error("openai caído"));
    const res = await POST(req({ message: { chat: { id: 7 }, text: "hola" } }, SECRET));
    expect(res.status).toBe(200);
  });

  it("ignora updates sin texto pero responde 200", async () => {
    const res = await POST(req({ message: { chat: { id: 42 } } }, SECRET));
    expect(res.status).toBe(200);
    expect(handleIncomingMessage).not.toHaveBeenCalled();
  });

  it("devuelve 400 si el body no es JSON válido", async () => {
    const bad = new Request("https://app.test/api/telegram", {
      method: "POST",
      headers: { "X-Telegram-Bot-Api-Secret-Token": SECRET, "Content-Type": "application/json" },
      body: "no-json{",
    }) as unknown as NextRequest;
    const res = await POST(bad);
    expect(res.status).toBe(400);
    expect(handleIncomingMessage).not.toHaveBeenCalled();
  });
});
