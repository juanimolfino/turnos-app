import { createHmac } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { GET, POST } from "./route";

const sendMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/whatsapp/client", () => ({
  sendWhatsAppText: (input: unknown) => sendMock(input),
}));

describe("WhatsApp webhook route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("verifica el webhook de Meta devolviendo el challenge", async () => {
    process.env.WHATSAPP_VERIFY_TOKEN = "verify-token";
    const request = new NextRequest(
      "https://example.com/api/whatsapp/webhook?hub.mode=subscribe&hub.verify_token=verify-token&hub.challenge=abc123",
    );

    const response = await GET(request);

    expect(response.status).toBe(200);
    expect(await response.text()).toBe("abc123");
  });

  it("rechaza verificación con token incorrecto", async () => {
    process.env.WHATSAPP_VERIFY_TOKEN = "verify-token";
    const request = new NextRequest(
      "https://example.com/api/whatsapp/webhook?hub.mode=subscribe&hub.verify_token=bad&hub.challenge=abc123",
    );

    const response = await GET(request);

    expect(response.status).toBe(403);
  });

  it("responde hola mundo ante un mensaje de texto entrante", async () => {
    process.env.WHATSAPP_APP_SECRET = "app-secret";
    const body = JSON.stringify({
      object: "whatsapp_business_account",
      entry: [{
        changes: [{
          field: "messages",
          value: {
            metadata: { phone_number_id: "123456789" },
            contacts: [{ wa_id: "5491122334455" }],
            messages: [{ from: "5491122334455", type: "text", text: { body: "hola" } }],
          },
        }],
      }],
    });
    const signature = `sha256=${createHmac("sha256", "app-secret").update(body).digest("hex")}`;
    const request = new NextRequest("https://example.com/api/whatsapp/webhook", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-hub-signature-256": signature,
      },
      body,
    });

    const response = await POST(request);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
    expect(sendMock).toHaveBeenCalledWith({
      phoneNumberId: "123456789",
      text: "Hola mundo",
      to: "5491122334455",
    });
  });

  it("acepta status updates sin responder nada", async () => {
    process.env.WHATSAPP_APP_SECRET = "app-secret";
    const body = JSON.stringify({
      object: "whatsapp_business_account",
      entry: [{
        changes: [{
          field: "messages",
          value: {
            metadata: { phone_number_id: "123456789" },
            statuses: [{ id: "wamid.123", status: "delivered" }],
          },
        }],
      }],
    });
    const signature = `sha256=${createHmac("sha256", "app-secret").update(body).digest("hex")}`;
    const request = new NextRequest("https://example.com/api/whatsapp/webhook", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-hub-signature-256": signature,
      },
      body,
    });

    const response = await POST(request);

    expect(response.status).toBe(200);
    expect(sendMock).not.toHaveBeenCalled();
  });

  it("rechaza POST sin firma válida", async () => {
    process.env.WHATSAPP_APP_SECRET = "app-secret";
    const request = new NextRequest("https://example.com/api/whatsapp/webhook", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ object: "whatsapp_business_account", entry: [] }),
    });

    const response = await POST(request);

    expect(response.status).toBe(401);
  });
});
