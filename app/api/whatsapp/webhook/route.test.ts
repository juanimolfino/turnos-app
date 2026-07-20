import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { GET, POST } from "./route";

describe("WhatsApp webhook route", () => {
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

  it("acepta POST firmado pero no procesa negocio todavía", async () => {
    process.env.WHATSAPP_APP_SECRET = "app-secret";
    const body = JSON.stringify({ object: "whatsapp_business_account", entry: [] });
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
