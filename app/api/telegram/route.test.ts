import { describe, expect, it, vi, beforeEach } from "vitest";
import type { NextRequest } from "next/server";

// Capturamos los callbacks de after() y los corremos manualmente, ya que fuera
// del runtime de Next no hay scope de request.
const afterCallbacks: Array<() => unknown> = [];
vi.mock("next/server", async (importOriginal) => {
  const actual = await importOriginal<typeof import("next/server")>();
  return { ...actual, after: (fn: () => unknown) => afterCallbacks.push(fn) };
});

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

async function runAfter() {
  for (const cb of afterCallbacks) await cb();
}

describe("POST /api/telegram", () => {
  beforeEach(() => {
    process.env.TELEGRAM_WEBHOOK_SECRET = SECRET;
    handleIncomingMessage.mockReset();
    afterCallbacks.length = 0;
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

  it("devuelve 200 y procesa un mensaje de texto válido", async () => {
    const res = await POST(req({ message: { chat: { id: 42 }, text: "hola" } }, SECRET));
    expect(res.status).toBe(200);
    await runAfter();
    expect(handleIncomingMessage).toHaveBeenCalledWith({
      channel: "telegram",
      userId: "42",
      text: "hola",
    });
  });

  it("ignora updates sin texto pero responde 200", async () => {
    const res = await POST(req({ message: { chat: { id: 42 } } }, SECRET));
    expect(res.status).toBe(200);
    await runAfter();
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
