import { serve } from "inngest/next";
import { inngest } from "@/lib/inngest/client";
import { expireBotHoldsJob, runAiJob } from "@/lib/inngest/functions";

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [runAiJob, expireBotHoldsJob],
  signingKey: process.env.INNGEST_SIGNING_KEY
});
