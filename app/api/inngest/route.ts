import { serve } from "inngest/next";
import { inngest } from "@/lib/inngest/client";
import { expireBotHoldsJob, refreshMercadoPagoTokensJob, runAiJob } from "@/lib/inngest/functions";

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [runAiJob, expireBotHoldsJob, refreshMercadoPagoTokensJob],
  signingKey: process.env.INNGEST_SIGNING_KEY
});
