import { createServer } from "node:http";
import type { IncomingMessage, ServerResponse } from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";

import Retell from "retell-sdk";

const HOST = "127.0.0.1";
const PORT = 4173;
const BASE_URL = `http://${HOST}:${PORT}`;
const ALLOWED_ORIGINS = new Set([BASE_URL, `http://localhost:${PORT}`]);

type StaticRoute = {
  filePath: string;
  contentType: string;
};

function requireEnvironmentVariable(name: string): string {
  const value = process.env[name]?.trim();

  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
}

const STATIC_ROUTES = new Map<string, StaticRoute>([
  [
    "/",
    {
      filePath: path.resolve("retell/web-call/index.html"),
      contentType: "text/html; charset=utf-8",
    },
  ],
  [
    "/client.js",
    {
      filePath: path.resolve("retell/web-call/client.js"),
      contentType: "text/javascript; charset=utf-8",
    },
  ],
  [
    "/vendor-aliases.js",
    {
      filePath: path.resolve("retell/web-call/vendor-aliases.js"),
      contentType: "text/javascript; charset=utf-8",
    },
  ],
  [
    "/styles.css",
    {
      filePath: path.resolve("retell/web-call/styles.css"),
      contentType: "text/css; charset=utf-8",
    },
  ],
  [
    "/assets/eventemitter3.js",
    {
      filePath: path.resolve(
        "node_modules/eventemitter3/dist/eventemitter3.umd.min.js",
      ),
      contentType: "text/javascript; charset=utf-8",
    },
  ],
  [
    "/assets/livekit.js",
    {
      filePath: path.resolve(
        "node_modules/livekit-client/dist/livekit-client.umd.js",
      ),
      contentType: "text/javascript; charset=utf-8",
    },
  ],
  [
    "/assets/retell-web-client.js",
    {
      filePath: path.resolve(
        "node_modules/retell-client-js-sdk/dist/index.umd.js",
      ),
      contentType: "text/javascript; charset=utf-8",
    },
  ],
]);

function setSecurityHeaders(response: ServerResponse): void {
  response.setHeader("Cache-Control", "no-store");
  response.setHeader("X-Content-Type-Options", "nosniff");
  response.setHeader("Referrer-Policy", "no-referrer");
  response.setHeader("Permissions-Policy", "microphone=(self)");
  response.setHeader(
    "Content-Security-Policy",
    [
      "default-src 'self'",
      "script-src 'self'",
      "style-src 'self'",
      "connect-src 'self' https://*.livekit.cloud wss://*.livekit.cloud",
      "media-src 'self' blob:",
      "img-src 'self' data:",
      "object-src 'none'",
      "base-uri 'none'",
      "frame-ancestors 'none'",
    ].join("; "),
  );
}

function sendJson(
  response: ServerResponse,
  status: number,
  body: Record<string, unknown>,
): void {
  setSecurityHeaders(response);
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
  });
  response.end(`${JSON.stringify(body)}\n`);
}

function isAllowedBrowserRequest(request: IncomingMessage): boolean {
  const origin = request.headers.origin;

  return typeof origin === "string" && ALLOWED_ORIGINS.has(origin);
}

async function serveStaticFile(
  response: ServerResponse,
  route: StaticRoute,
): Promise<void> {
  const content = await readFile(route.filePath);

  setSecurityHeaders(response);
  response.writeHead(200, { "Content-Type": route.contentType });
  response.end(content);
}

async function main() {
  const client = new Retell({
    apiKey: requireEnvironmentVariable("RETELL_API_KEY_GENSTONE"),
  });
  const agents = await client.agent.list({ limit: 100 });
  const listedAgent = agents.items?.find(
    (candidate) => candidate.agent_name === "GenStone Customer Agent",
  );

  if (!listedAgent) {
    throw new Error("Retell agent GenStone Customer Agent was not found.");
  }

  const agent = await client.agent.retrieve(listedAgent.agent_id);
  const server = createServer(async (request, response) => {
    try {
      const requestUrl = new URL(request.url ?? "/", BASE_URL);

      if (request.method === "GET" && requestUrl.pathname === "/api/health") {
        sendJson(response, 200, {
          ok: true,
          agent_id: agent.agent_id,
          api_key_exposed: false,
        });
        return;
      }

      if (request.method === "POST" && requestUrl.pathname === "/api/web-call") {
        if (!isAllowedBrowserRequest(request)) {
          sendJson(response, 403, { ok: false, error: "origin_not_allowed" });
          return;
        }

        const call = await client.call.createWebCall({
          agent_id: agent.agent_id,
          agent_version: agent.version,
          metadata: {
            purpose: "genstone_local_web_call_qa",
          },
          retell_llm_dynamic_variables: {
            user_number: "+18085550101",
          },
        });

        console.log(`Created Retell web QA call ${call.call_id}.`);
        sendJson(response, 201, {
          ok: true,
          access_token: call.access_token,
          call_id: call.call_id,
        });
        return;
      }

      const staticRoute = STATIC_ROUTES.get(requestUrl.pathname);

      if (request.method === "GET" && staticRoute) {
        await serveStaticFile(response, staticRoute);
        return;
      }

      sendJson(response, 404, { ok: false, error: "not_found" });
    } catch (error) {
      console.error("Retell web-call tester request failed.", error);
      sendJson(response, 500, { ok: false, error: "request_failed" });
    }
  });

  server.listen(PORT, HOST, () => {
    console.log(`GenStone Retell web-call tester: ${BASE_URL}`);
    console.log("The Retell API key remains server-side. Press Ctrl+C to stop.");
  });
}

await main();
