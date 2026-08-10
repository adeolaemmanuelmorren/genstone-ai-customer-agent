import type { Context } from "hono";
import {
  createJsonRouteErrorHandler,
  readBearerToken,
} from "@bradford-road/api";
import type { CustomerAgentEnv } from "../../types/env";

export {
  createJsonRouteErrorHandler,
  isRecord,
  parseJsonBody,
  stringOrUndefined,
} from "@bradford-road/api";

export type AppContext = Context<{ Bindings: CustomerAgentEnv }>;

export function requireServiceBearer(c: AppContext): Response | null {
  const expectedToken = c.env.GENSTONE_AI_CUSTOMER_AGENT_WORKER_API_KEY;
  const actualToken = readBearerToken(c);

  if (!expectedToken || !actualToken || actualToken !== expectedToken) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  return null;
}

export function getLogLevel(
  c: AppContext,
): "debug" | "info" | "warn" | "error" {
  const value = c.env.LOG_LEVEL;

  if (
    value === "debug" ||
    value === "info" ||
    value === "warn" ||
    value === "error"
  ) {
    return value;
  }

  if (c.env.ENVIRONMENT === "development") {
    return "debug";
  }

  return "info";
}
