import type { Hono } from "hono";
import { createLogger } from "../../lib/observability/logger";
import {
  normalizeRetellWebhook,
  retellWebhookPayloadSchema,
} from "../../schemas/retell-webhook";
import { upsertCallSession } from "../../services/persistence/call-sessions-repository";
import { getCompanyId, withDatabase } from "../../services/persistence/db";
import {
  beginProviderEvent,
  markProviderEventArchived,
  markProviderEventCompleted,
  markProviderEventFailed,
} from "../../services/persistence/provider-events-repository";
import {
  archiveRetellWebhook,
  describeWebhookArchive,
} from "../../services/r2/retell-webhook-archive";
import { verifyRetellSignature } from "../../services/retell/signature";
import type { CustomerAgentEnv } from "../../types/env";
import { getLogLevel } from "./http-utils";

const ROUTE = "/v1/retell/webhooks";

export function registerRetellWebhookRoutes(
  app: Hono<{ Bindings: CustomerAgentEnv }>,
): void {
  app.post(ROUTE, async (c) => {
    const rawBody = await c.req.text();
    const authenticated = await verifyRetellSignature({
      rawBody,
      secret: c.env.RETELL_WEBHOOK_API_KEY_GENSTONE,
      signature: c.req.header("x-retell-signature"),
    });

    if (!authenticated) {
      return c.json({ error: "Unauthorized" }, 401);
    }

    const parsedJson = parseJson(rawBody);
    const parsedPayload = retellWebhookPayloadSchema.safeParse(parsedJson);
    if (!parsedPayload.success) {
      return c.json({ error: "Invalid Retell webhook payload" }, 400);
    }

    const event = normalizeRetellWebhook(parsedPayload.data);
    const archive = await describeWebhookArchive({
      rawBody,
      callId: event.callId,
      providerEventId: event.providerEventId,
    });
    const providerEventId = event.providerEventId ?? archive.sha256;
    const logger = createLogger({
      minLevel: getLogLevel(c),
      context: { entrypoint: "http", route: ROUTE, callId: event.callId },
    });

    const result = await withDatabase(c.env, async (db) => {
      const stored = await beginProviderEvent(db, {
        id: crypto.randomUUID(),
        companyId: getCompanyId(c.env),
        providerEventId,
        eventType: event.eventType,
        callId: event.callId,
        payloadSha256: archive.sha256,
        payloadSizeBytes: archive.sizeBytes,
      });

      if (stored.processingStatus === "completed") {
        return { duplicate: true };
      }

      try {
        await archiveRetellWebhook(c.env.CALL_ARCHIVE_BUCKET, rawBody, archive);
        await markProviderEventArchived(db, {
          id: stored.id,
          objectKey: archive.objectKey,
          payloadSha256: archive.sha256,
          payloadSizeBytes: archive.sizeBytes,
        });
        await upsertCallSession(db, getCompanyId(c.env), event);
        await markProviderEventCompleted(db, stored.id);
        return { duplicate: false };
      } catch (error) {
        await markProviderEventFailed(db, stored.id, "webhook_processing_failed");
        throw error;
      }
    });

    logger.info("Retell webhook stored", {
      eventType: event.eventType,
      duplicate: result.duplicate,
    });

    return c.json({
      ok: true,
      event_type: event.eventType,
      duplicate: result.duplicate,
    });
  });
}

function parseJson(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}
