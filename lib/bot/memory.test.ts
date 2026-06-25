import { describe, expect, it, vi, beforeEach } from "vitest";

// Mockeamos el cliente Supabase admin: nunca pegamos a la base real.
// from(TABLE) expone tanto la cadena de lectura (.select().eq().maybeSingle())
// como la escritura (.upsert()).
const maybeSingle = vi.fn();
const upsert = vi.fn();
const eq = vi.fn(() => ({ maybeSingle }));
const select = vi.fn(() => ({ eq }));
const from = vi.fn(() => ({ select, upsert }));

vi.mock("@/lib/supabase/admin", () => ({
  getSupabaseAdmin: () => ({ from }),
}));

import { getHistory, appendTurns } from "@/lib/bot/memory";

describe("getHistory", () => {
  beforeEach(() => {
    maybeSingle.mockReset();
    from.mockClear();
  });

  it("devuelve [] cuando no hay fila", async () => {
    maybeSingle.mockResolvedValue({ data: null, error: null });
    expect(await getHistory("telegram:1")).toEqual([]);
    expect(from).toHaveBeenCalledWith("bot_conversations");
  });

  it("devuelve los mensajes guardados cuando existe la fila", async () => {
    const messages = [{ role: "user", content: "hola" }];
    maybeSingle.mockResolvedValue({ data: { messages }, error: null });
    expect(await getHistory("telegram:1")).toEqual(messages);
  });

  it("devuelve [] ante error de la base", async () => {
    maybeSingle.mockResolvedValue({ data: null, error: { message: "boom" } });
    expect(await getHistory("telegram:1")).toEqual([]);
  });
});

describe("appendTurns", () => {
  beforeEach(() => {
    maybeSingle.mockReset();
    upsert.mockReset();
    upsert.mockResolvedValue({ error: null });
  });

  it("appendea a lo existente y recorta a los últimos 10 mensajes", async () => {
    // 9 mensajes previos + 2 nuevos = 11 → se conservan los últimos 10.
    const previos = Array.from({ length: 9 }, (_, i) => ({
      role: "user" as const,
      content: `m${i}`,
    }));
    maybeSingle.mockResolvedValue({ data: { messages: previos }, error: null });

    await appendTurns("telegram:1", [
      { role: "user", content: "nuevo-user" },
      { role: "assistant", content: "nuevo-bot" },
    ]);

    expect(upsert).toHaveBeenCalledTimes(1);
    const [row, opts] = upsert.mock.calls[0];
    expect(row.conversation_key).toBe("telegram:1");
    expect(row.messages).toHaveLength(10);
    // El más viejo (m0) se descartó; los dos nuevos quedan al final.
    expect(row.messages[0]).toEqual({ role: "user", content: "m1" });
    expect(row.messages.at(-2)).toEqual({ role: "user", content: "nuevo-user" });
    expect(row.messages.at(-1)).toEqual({ role: "assistant", content: "nuevo-bot" });
    expect(typeof row.updated_at).toBe("string");
    expect(opts).toEqual({ onConflict: "conversation_key" });
  });

  it("guarda solo los turnos nuevos cuando no hay historial previo", async () => {
    maybeSingle.mockResolvedValue({ data: null, error: null });

    await appendTurns("telegram:2", [
      { role: "user", content: "hola" },
      { role: "assistant", content: "buenas" },
    ]);

    const [row] = upsert.mock.calls[0];
    expect(row.messages).toEqual([
      { role: "user", content: "hola" },
      { role: "assistant", content: "buenas" },
    ]);
  });
});
