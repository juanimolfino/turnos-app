import { NextResponse } from "next/server";

// Superficie legacy del boilerplate SaaS (créditos, jobs de IA/fal.ai, Stripe,
// checkout de créditos por Mercado Pago). Cancha NO usa nada de esto: su cobro es
// el marketplace por club vía OAuth. Estos endpoints quedaban alcanzables por
// cualquier usuario autenticado y pegaban a APIs pagas (fal.ai) o exponían la
// config central de pagos → superficie de gasto/abuso. Se deshabilitan por
// defecto. Para reactivarlos intencionalmente (si algún día se define monetización)
// setear ENABLE_LEGACY_SAAS="true".
export const LEGACY_SAAS_ENABLED = process.env.ENABLE_LEGACY_SAAS === "true";

export function legacyDisabledResponse() {
  return NextResponse.json({ error: "Not found" }, { status: 404 });
}
