type SendWhatsAppTextInput = {
  to: string;
  text: string;
  phoneNumberId?: string | null;
};

function normalizeEnv(value: string | null | undefined) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

export async function sendWhatsAppText(input: SendWhatsAppTextInput) {
  const accessToken = normalizeEnv(process.env.WHATSAPP_ACCESS_TOKEN);
  const phoneNumberId = normalizeEnv(input.phoneNumberId) ?? normalizeEnv(process.env.WHATSAPP_PHONE_NUMBER_ID);

  if (!accessToken) throw new Error("WHATSAPP_ACCESS_TOKEN no configurado");
  if (!phoneNumberId) throw new Error("WHATSAPP_PHONE_NUMBER_ID no configurado");

  const response = await fetch(`https://graph.facebook.com/v25.0/${phoneNumberId}/messages`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to: input.to,
      type: "text",
      text: { body: input.text },
    }),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`WhatsApp send fallo (${response.status}): ${body}`);
  }
}
