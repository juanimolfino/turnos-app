// Abstracción multi-canal del bot. La lógica de negocio (handle.ts) trabaja
// solo con estos tipos y nunca conoce el canal concreto (Telegram, WhatsApp, etc.).

export type Channel = "telegram";

export type IncomingMessage = {
  channel: Channel;
  userId: string; // id del usuario en el canal (ej. chat.id en Telegram)
  text: string;
};

// Cada canal implementa esta interface para poder responderle al usuario.
export interface ChannelAdapter {
  send(userId: string, text: string): Promise<void>;
}
