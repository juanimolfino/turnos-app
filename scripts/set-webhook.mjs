/**
 * set-webhook.mjs
 * Registra el webhook del bot de Telegram apuntando a la app desplegada y
 * confirma el resultado con getWebhookInfo.
 *
 * Uso:   npm run set-webhook
 *        (o: node scripts/set-webhook.mjs)
 *
 * Lee del entorno (cargando .env.local):
 *   - TELEGRAM_BOT_TOKEN
 *   - TELEGRAM_WEBHOOK_SECRET
 *   - TELEGRAM_WEBHOOK_URL
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

// ── Carga simple de .env.local (sin dependencias) ───────────────────────────
function loadEnvLocal() {
  const root = join(dirname(fileURLToPath(import.meta.url)), "..");
  let raw;
  try {
    raw = readFileSync(join(root, ".env.local"), "utf8");
  } catch {
    return; // si no existe, seguimos con el entorno tal cual
  }
  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    value = value.replace(/^["']|["']$/g, ""); // quita comillas envolventes
    if (!(key in process.env)) process.env[key] = value;
  }
}

loadEnvLocal();

const TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const SECRET = process.env.TELEGRAM_WEBHOOK_SECRET;
const URL = process.env.TELEGRAM_WEBHOOK_URL;

const missing = [
  ["TELEGRAM_BOT_TOKEN", TOKEN],
  ["TELEGRAM_WEBHOOK_SECRET", SECRET],
  ["TELEGRAM_WEBHOOK_URL", URL],
]
  .filter(([, v]) => !v)
  .map(([k]) => k);

if (missing.length) {
  console.error(`✗ Faltan variables en el entorno: ${missing.join(", ")}`);
  console.error("  Definilas en .env.local antes de correr el script.");
  process.exit(1);
}

const api = (method) => `https://api.telegram.org/bot${TOKEN}/${method}`;

// Llama a la Bot API y verifica el campo `ok`. Nunca imprime token ni secret.
async function callTelegram(method, body) {
  const res = await fetch(api(method), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body ?? {}),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.ok) {
    const desc = data.description ?? `HTTP ${res.status}`;
    throw new Error(`${method} falló: ${desc}`);
  }
  return data.result;
}

try {
  console.log(`→ Registrando webhook en: ${URL}`);
  await callTelegram("setWebhook", {
    url: URL,
    secret_token: SECRET,
    allowed_updates: ["message"],
    drop_pending_updates: true,
  });
  console.log("✓ setWebhook OK");

  const info = await callTelegram("getWebhookInfo");
  console.log("\n── getWebhookInfo ──────────────────────────────");
  console.log(`url:                   ${info.url || "(vacío)"}`);
  console.log(`pending_update_count:  ${info.pending_update_count ?? 0}`);
  console.log(`last_error_message:    ${info.last_error_message ?? "(ninguno)"}`);
} catch (err) {
  console.error(`\n✗ ${err.message}`);
  process.exit(1);
}
