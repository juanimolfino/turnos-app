import { getSupabaseAdmin } from "@/lib/supabase/admin";
import type { ChatTurn } from "@/lib/bot/brain";

// Memoria de conversación del bot. Una fila por hilo en bot_conversations,
// identificada por conversationKey (`${channel}:${userId}`). Reusa el cliente
// Supabase server-side con service_role; las credenciales viven solo en el server.

// Recortamos a los últimos N mensajes para acotar tokens y tamaño de fila.
const MAX_MESSAGES = 10;

const TABLE = "bot_conversations";

type ConversationRow = {
  conversation_key: string;
  messages: ChatTurn[];
  updated_at: string;
};

// El cliente admin no está tipado con el schema de la DB (las queries de datos
// del proyecto van por Drizzle), así que .from() devuelve `never`. Tipamos
// puntualmente el acceso a esta tabla para conservar type-safety en memory.ts.
function table() {
  return getSupabaseAdmin().from(TABLE) as unknown as {
    select: (columns: string) => {
      eq: (column: string, value: string) => {
        maybeSingle: () => Promise<{
          data: Pick<ConversationRow, "messages"> | null;
          error: { message: string } | null;
        }>;
      };
    };
    upsert: (
      row: ConversationRow,
      options: { onConflict: string },
    ) => Promise<{ error: { message: string } | null }>;
  };
}

export async function getHistory(conversationKey: string): Promise<ChatTurn[]> {
  const { data, error } = await table()
    .select("messages")
    .eq("conversation_key", conversationKey)
    .maybeSingle();

  if (error) {
    console.error("[memory] getHistory error:", error.message);
    return [];
  }
  // Sin fila → conversación nueva.
  return data?.messages ?? [];
}

export async function appendTurns(conversationKey: string, turns: ChatTurn[]): Promise<void> {
  const existing = await getHistory(conversationKey);
  const messages = [...existing, ...turns].slice(-MAX_MESSAGES);

  const { error } = await table().upsert(
    {
      conversation_key: conversationKey,
      messages,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "conversation_key" },
  );

  if (error) console.error("[memory] appendTurns error:", error.message);
}
