import { describe, expect, it, vi } from "vitest";

// Mockeamos el SDK de OpenAI: nunca pegamos a la API real en tests.
// Cada test setea su propia mockImplementation (evitamos mockReset/mockClear en
// beforeEach: combinados con un throw disparan un falso "unhandled rejection"
// en vitest, aunque el cerebro capture el error correctamente).
const create = vi.fn();
vi.mock("openai", () => ({
  default: class {
    chat = { completions: { create } };
  },
}));

import { generarRespuesta, SYSTEM_PROMPT } from "@/lib/bot/brain";

const okResponse = (content: string) => ({ choices: [{ message: { content } }] });

describe("generarRespuesta", () => {
  it("devuelve el texto del modelo cuando la API responde ok", async () => {
    create.mockImplementation(async () => okResponse("  Dale, ¿para qué día buscás?  "));
    const out = await generarRespuesta("quiero una cancha");
    expect(out).toBe("Dale, ¿para qué día buscás?"); // trim aplicado
  });

  it("envía el system prompt en la llamada", async () => {
    create.mockImplementation(async () => okResponse("hola"));
    await generarRespuesta("hola");

    const args = create.mock.calls.at(-1)![0];
    expect(args.messages[0]).toEqual({ role: "system", content: SYSTEM_PROMPT });
    expect(args.messages[1]).toEqual({ role: "user", content: "hola" });
  });

  it("incluye el historial entre el system prompt y el mensaje nuevo", async () => {
    create.mockImplementation(async () => okResponse("dale"));
    const history = [
      { role: "user" as const, content: "hola" },
      { role: "assistant" as const, content: "¿para qué día?" },
    ];
    await generarRespuesta("el sábado", history);

    const args = create.mock.calls.at(-1)![0];
    expect(args.messages).toEqual([
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: "hola" },
      { role: "assistant", content: "¿para qué día?" },
      { role: "user", content: "el sábado" },
    ]);
  });

  it("devuelve el fallback si la respuesta viene vacía", async () => {
    create.mockImplementation(async () => okResponse(""));
    const out = await generarRespuesta("hola");
    expect(out).toMatch(/problemita/i);
  });

  it("devuelve el fallback cuando la API tira error", async () => {
    create.mockImplementation(async () => {
      throw new Error("rate limit");
    });
    const out = await generarRespuesta("hola");
    expect(out).toMatch(/problemita/i); // texto de fallback amable
  });
});
