import type { Hono } from "hono";
import { createLogger } from "../../lib/observability/logger";
import {
  normalizeRetellWebhook,
  retellWebhookPayloadSchema,
} from "../../schemas/retell-webhook";
import { processRetellWebhook } from "../../services/review-orchestration/retell-outcomes";
import type { ReviewAgentEnv } from "../../types/env";
import {
  getLogLevel,
  requireRetellWebhookAuth,
} from "./http-utils";

export function registerRetellWebhookRoutes(app: Hono<{ Bindings: ReviewAgentEnv }>): void {
  app.post("/api/retell-webhook", async (c) => {
    const rawBody = await c.req.text();
    const authError = await requireRetellWebhookAuth(c, rawBody);
    if (authError) {
      return authError;
    }

    const body = parseRetellWebhookBody(rawBody);
    if (!body) {
      return c.json({ error: "Invalid JSON body" }, 400);
    }

    const parsed = retellWebhookPayloadSchema.safeParse(body);
    if (!parsed.success) {
      return c.json({ error: "Invalid Retell webhook payload", issues: parsed.error.issues }, 400);
    }

    const event = normalizeRetellWebhook(parsed.data);
    const logger = createLogger({
      minLevel: getLogLevel(c),
      context: {
        entrypoint: "http",
        route: "/api/retell-webhook",
        callId: event.callId,
        orderId: event.orderId,
      },
    });
    logger.info("Processing Retell webhook", { eventType: event.eventType });

    const result = await processRetellWebhook(c.env, event);
    logger.info("Retell webhook handled", result);

    return c.json({
      ok: true,
      eventType: event.eventType,
      ...result,
    });
  });
}

function parseRetellWebhookBody(rawBody: string): unknown {
  try {
    return JSON.parse(rawBody);
  } catch {
    return null;
  }
}
