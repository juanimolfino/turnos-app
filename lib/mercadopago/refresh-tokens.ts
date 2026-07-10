import {
  getClubMercadoPagoCredentialsNeedingRefresh,
  updateClubMercadoPagoCredentialsTokens,
} from "@/lib/db/queries";
import { refreshMercadoPagoAccessToken } from "@/lib/mercadopago/oauth";

// El access_token de MP vence a los 180 días. Este módulo renueva por adelantado
// los que están por vencer, usando el refresh_token guardado, para que ningún club
// se quede sin poder cobrar de sorpresa. Es la lógica pura; el disparo lo hace un
// cron de Inngest (y/o se puede invocar manualmente). Cada club se procesa aislado:
// si el refresh de uno falla, no frena a los demás.

const DEFAULT_WITHIN_DAYS = 30;
const DAY_MS = 24 * 60 * 60 * 1000;

export type RefreshResult = {
  checked: number;
  refreshed: string[];
  failed: { clubId: string; error: string }[];
};

export async function refreshExpiringMercadoPagoTokens(
  opts: { withinDays?: number; now?: Date } = {},
): Promise<RefreshResult> {
  const withinDays = opts.withinDays ?? DEFAULT_WITHIN_DAYS;
  const now = opts.now ?? new Date();
  const before = new Date(now.getTime() + withinDays * DAY_MS);

  const rows = await getClubMercadoPagoCredentialsNeedingRefresh(before);
  const result: RefreshResult = { checked: rows.length, refreshed: [], failed: [] };

  for (const row of rows) {
    if (!row.refreshToken) {
      result.failed.push({ clubId: row.clubId, error: "sin refresh_token" });
      continue;
    }
    try {
      const tokens = await refreshMercadoPagoAccessToken(row.refreshToken);
      await updateClubMercadoPagoCredentialsTokens(row.clubId, {
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        expiresAt: tokens.expiresAt,
        publicKey: tokens.publicKey,
        scope: tokens.scope,
        liveMode: tokens.liveMode,
      });
      result.refreshed.push(row.clubId);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      // Ruidoso a propósito: si un club no se puede renovar, hay que enterarse.
      console.error("[mp refresh] no se pudo renovar el token de un club", { clubId: row.clubId, error: message });
      result.failed.push({ clubId: row.clubId, error: message });
    }
  }

  return result;
}
