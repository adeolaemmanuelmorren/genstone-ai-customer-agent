import { Hono } from "hono";
import { createLogger } from "../../lib/observability/logger";
import type { CustomerAgentEnv } from "../../types/env";
import { createJsonRouteErrorHandler, getLogLevel } from "./http-utils";
import { registerRetellWebhookRoutes } from "./retell-webhook-routes";
import { registerRetellToolRoutes } from "./retell-tool-routes";

const app = new Hono<{ Bindings: CustomerAgentEnv }>();

app.onError(createJsonRouteErrorHandler(({ route }) => {
  return createLogger({ context: { entrypoint: "http", route } });
}));

app.get("/health", (c) => {
  const logger = createLogger({
    minLevel: getLogLevel(c),
    context: { entrypoint: "http", route: "/health" },
  });

  logger.debug("Health check");

  return c.json({
    status: "ok",
    product: "genstone-ai-customer-agent",
    timestamp: new Date().toISOString(),
  });
});

registerRetellWebhookRoutes(app);
registerRetellToolRoutes(app);

export default app;
