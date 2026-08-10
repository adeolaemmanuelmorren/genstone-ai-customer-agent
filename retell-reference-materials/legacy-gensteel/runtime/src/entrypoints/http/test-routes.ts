import type { Hono } from "hono";
import { createLogger } from "../../lib/observability/logger";
import { testWebCallPayloadSchema } from "../../schemas/test-web-call";
import { listTestCalls } from "../../services/persistence/review-agent-repository";
import { startTestWebReviewFollowup } from "../../services/review-orchestration/review-followup";
import {
  buildReviewOrderFromSalesforce,
  buildSalesforceBuildingDetails,
  fetchSalesforceOpportunity,
  fetchSalesforceOrder,
  listSalesforceReviewOrders,
} from "../../services/salesforce/client";
import type { ReviewAgentEnv } from "../../types/env";
import { createId } from "../../utils/ids";
import {
  getLogLevel,
  parseJsonBody,
  requireServiceBearer,
} from "./http-utils";

const REAL_CUSTOMER_EMAIL_WARNING =
  "do not use the real customer email as the email, to prevent emails going there during test";

export function registerTestRoutes(app: Hono<{ Bindings: ReviewAgentEnv }>): void {
  app.get("/api/test/orders", async (c) => {
    const authError = requireServiceBearer(c);
    if (authError) {
      return authError;
    }

    const logger = createLogger({
      minLevel: getLogLevel(c),
      context: {
        entrypoint: "http",
        route: "/api/test/orders",
      },
    });
    const days = parseBoundedInteger(c.req.query("days"), 1, 90, 45);
    const limit = parseBoundedInteger(c.req.query("limit"), 1, 200, 50);
    const q = c.req.query("q")?.trim() || undefined;

    logger.info("Listing GenSteel review test orders", { days, limit, q });
    const result = await listSalesforceReviewOrders(c.env, { days, limit, q });
    logger.info("Listed GenSteel review test orders", {
      count: result.orders.length,
    });

    return c.json(result);
  });

  app.get("/api/test/calls", async (c) => {
    const authError = requireServiceBearer(c);
    if (authError) {
      return authError;
    }

    const logger = createLogger({
      minLevel: getLogLevel(c),
      context: {
        entrypoint: "http",
        route: "/api/test/calls",
      },
    });
    const limit = parseBoundedInteger(c.req.query("limit"), 1, 200, 50);

    logger.info("Listing GenSteel review test calls", { limit });
    const result = await listTestCalls(c.env, { limit });
    logger.info("Listed GenSteel review test calls", {
      count: result.calls.length,
    });

    return c.json(result);
  });

  app.get("/api/test/orders/:orderId", async (c) => {
    const authError = requireServiceBearer(c);
    if (authError) {
      return authError;
    }

    const orderId = c.req.param("orderId");
    const logger = createLogger({
      minLevel: getLogLevel(c),
      context: {
        entrypoint: "http",
        route: "/api/test/orders/:orderId",
        orderId,
      },
    });

    logger.info("Fetching GenSteel review test order details");
    const orderRecord = await fetchSalesforceOrder(c.env, orderId);
    const opportunityId = readString(orderRecord, "OpportunityId");
    if (!opportunityId) {
      return c.json({ error: "Salesforce order did not include OpportunityId" }, 400);
    }

    const opportunityRecord = await fetchSalesforceOpportunity(c.env, opportunityId);
    const payload = {
      data: {
        order_id: orderId,
        opportunity_id: opportunityId,
        order_email: readString(orderRecord, "Primary_Contact_Email__c"),
      },
    };
    const order = buildReviewOrderFromSalesforce(payload, orderRecord, opportunityRecord);
    const building = buildSalesforceBuildingDetails(orderRecord, opportunityRecord);

    logger.info("Fetched GenSteel review test order details", {
      orderNumber: order.orderNumber,
      opportunityId,
    });

    return c.json({
      order: {
        orderId: order.orderId,
        orderNumber: order.orderNumber,
        opportunityId,
        customerName: order.customerName,
        customerEmail: order.customerEmail,
        customerPhone: order.customerPhone,
        buildingDescription: order.buildingDescription,
        buildingSize: order.buildingSize,
        buildingType: building.buildingType,
        buildingSystem: building.buildingSystem,
        salesRepName: order.salesRepName,
        deliveryCoordinatorName: order.deliveryCoordinatorName,
        projectCoordinatorName: order.projectCoordinatorName,
        building,
      },
    });
  });

  app.get("/api/test/web-call", (c) => {
    return c.html(renderWebCallTestPage({
      orderId: c.req.query("order_id") ?? "801UP00000gpE0jYAE",
      opportunityId: c.req.query("opportunity_id") ?? "006UP00000WU9D7YAL",
      customerEmail: c.req.query("customer_email") ?? "adeola@datastacklabs.com",
      customerName: c.req.query("customer_name") ?? "Adeola",
    }));
  });

  app.post("/api/test/web-call", async (c) => {
    const authError = requireServiceBearer(c);
    if (authError) {
      return authError;
    }

    const body = await parseJsonBody(c);
    if (body instanceof Response) {
      return body;
    }

    const parsed = testWebCallPayloadSchema.safeParse(body);
    if (!parsed.success) {
      return c.json({ error: "Invalid test web-call payload", issues: parsed.error.issues }, 400);
    }

    const logger = createLogger({
      minLevel: getLogLevel(c),
      context: {
        entrypoint: "http",
        route: "/api/test/web-call",
        orderId: parsed.data.order_id,
      },
    });
    logger.info("Creating Retell test web call from Salesforce order");
    const promptAgent = parsed.data.prompt_agent ?? "conversation_flow";

    const orderRecord = await fetchSalesforceOrder(c.env, parsed.data.order_id);
    const opportunityId = parsed.data.opportunity_id ?? readString(orderRecord, "OpportunityId");
    if (!opportunityId) {
      return c.json({ error: "Salesforce order did not include OpportunityId" }, 400);
    }

    const opportunityRecord = await fetchSalesforceOpportunity(c.env, opportunityId);
    const realCustomerEmails = getSalesforceCustomerEmails(orderRecord, opportunityRecord);
    if (realCustomerEmails.some((email) => isSameEmail(parsed.data.customer_email, email))) {
      return c.json({ error: REAL_CUSTOMER_EMAIL_WARNING }, 400);
    }

    const customerioPayload = {
      data: {
        order_id: parsed.data.order_id,
        opportunity_id: opportunityId,
        order_email: parsed.data.customer_email,
      },
    };
    const order = buildReviewOrderFromSalesforce(
      customerioPayload,
      orderRecord,
      opportunityRecord,
    );

    const building = buildSalesforceBuildingDetails(orderRecord, opportunityRecord);
    const testRunId = createId("test_run");
    const testOrder = {
      ...order,
      orderId: testRunId,
      executionMode: "test" as const,
      testRunId,
      sourceOrderId: order.orderId,
      sourceOrderNumber: order.orderNumber,
      customerEmail: parsed.data.customer_email,
      customerName: parsed.data.customer_name ?? order.customerName,
      testOverrides: {
        recipientEmail: parsed.data.customer_email,
        recipientName: parsed.data.customer_name,
        escalationEmail: parsed.data.escalation_email ?? parsed.data.customer_email,
        callbackDelaySeconds: parsed.data.callback_delay_seconds ?? 10,
      },
    };

    const webCall = await startTestWebReviewFollowup(c.env, testOrder, {
      promptAgent,
    });
    if (!webCall.callId || !webCall.accessToken) {
      return c.json({ error: "Retell test web call was not created." }, 409);
    }

    logger.info("Retell test web call created", { callId: webCall.callId });

    return c.json({
      callId: webCall.callId,
      accessToken: webCall.accessToken,
      testRunId,
      promptAgent,
      sourceOrderId: order.orderId,
      order: {
        orderId: testOrder.orderId,
        orderNumber: testOrder.orderNumber,
        opportunityId,
        customerName: testOrder.customerName,
        customerEmail: testOrder.customerEmail,
        buildingDescription: testOrder.buildingDescription,
        buildingSize: testOrder.buildingSize,
        buildingType: building.buildingType,
        buildingSystem: building.buildingSystem,
        salesRepName: testOrder.salesRepName,
        deliveryCoordinatorName: testOrder.deliveryCoordinatorName,
        projectCoordinatorName: testOrder.projectCoordinatorName,
        building,
      },
      note: "Test web calls use the same outcome workflow path with test recipients and test-scoped persistence.",
    }, 201);
  });
}

function parseBoundedInteger(
  value: string | undefined,
  min: number,
  max: number,
  defaultValue: number,
): number {
  if (!value) {
    return defaultValue;
  }

  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) {
    return defaultValue;
  }

  return Math.min(max, Math.max(min, parsed));
}

function readString(record: Record<string, unknown>, fieldName: string): string | undefined {
  const value = record[fieldName];
  if (typeof value === "string" && value.trim()) {
    return value.trim();
  }

  return undefined;
}

function getSalesforceCustomerEmails(
  orderRecord: Record<string, unknown>,
  opportunityRecord: Record<string, unknown>,
): string[] {
  return [
    readString(orderRecord, "Primary_Contact_Email__c"),
    readString(orderRecord, "Delivery_Email__c"),
    readString(orderRecord, "billto_email__c"),
    readString(orderRecord, "shipto_email__c"),
    readString(opportunityRecord, "Primary_Contact_Email__c"),
    readString(opportunityRecord, "new_email__c"),
  ].filter((value): value is string => Boolean(value));
}

function isSameEmail(left: string | undefined, right: string | undefined): boolean {
  if (!left || !right) {
    return false;
  }

  return left.trim().toLowerCase() === right.trim().toLowerCase();
}

type WebCallTestPageDefaults = {
  orderId: string;
  opportunityId: string;
  customerEmail: string;
  customerName: string;
};

function renderWebCallTestPage(defaults: WebCallTestPageDefaults): string {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>GenSteel Retell Test Call</title>
    <style>
      :root {
        color-scheme: light;
        font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        line-height: 1.45;
      }

      body {
        margin: 0;
        background: #f6f7f9;
        color: #17202a;
      }

      main {
        width: min(760px, calc(100vw - 32px));
        margin: 40px auto;
      }

      h1 {
        margin: 0 0 8px;
        font-size: 24px;
        font-weight: 700;
      }

      p {
        margin: 0 0 24px;
        color: #52606d;
      }

      form,
      section {
        display: grid;
        gap: 16px;
        padding: 20px;
        border: 1px solid #d8dee6;
        border-radius: 8px;
        background: #ffffff;
      }

      section {
        margin-top: 16px;
      }

      label {
        display: grid;
        gap: 6px;
        font-size: 13px;
        font-weight: 650;
        color: #344250;
      }

      input {
        width: 100%;
        box-sizing: border-box;
        border: 1px solid #c7d0da;
        border-radius: 6px;
        padding: 10px 12px;
        font: inherit;
      }

      .row {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 12px;
      }

      .actions {
        display: flex;
        gap: 10px;
        flex-wrap: wrap;
      }

      button {
        border: 0;
        border-radius: 6px;
        padding: 10px 14px;
        font: inherit;
        font-weight: 700;
        cursor: pointer;
      }

      button[type="submit"] {
        background: #166534;
        color: #ffffff;
      }

      button[type="button"] {
        background: #e7ebf0;
        color: #17202a;
      }

      button:disabled {
        cursor: not-allowed;
        opacity: 0.55;
      }

      pre {
        min-height: 96px;
        overflow: auto;
        margin: 0;
        padding: 12px;
        border-radius: 6px;
        background: #111827;
        color: #e5e7eb;
        white-space: pre-wrap;
      }

      @media (max-width: 680px) {
        .row {
          grid-template-columns: 1fr;
        }
      }
    </style>
  </head>
  <body>
    <main>
      <h1>GenSteel Retell Test Call</h1>
      <p>Creates a Retell browser call from a real Salesforce order without writing to Salesforce or dispatching outcome actions.</p>

      <form id="call-form">
        <label>
          Worker API Key
          <input id="api-key" name="api_key" type="password" autocomplete="off" required />
        </label>

        <div class="row">
          <label>
            Order ID
            <input id="order-id" name="order_id" value="${escapeHtml(defaults.orderId)}" required />
          </label>
          <label>
            Opportunity ID
            <input id="opportunity-id" name="opportunity_id" value="${escapeHtml(defaults.opportunityId)}" />
          </label>
        </div>

        <div class="row">
          <label>
            Customer Email
            <input id="customer-email" name="customer_email" type="email" value="${escapeHtml(defaults.customerEmail)}" />
          </label>
          <label>
            Customer Name
            <input id="customer-name" name="customer_name" value="${escapeHtml(defaults.customerName)}" />
          </label>
        </div>

        <div class="actions">
          <button id="start-call" type="submit">Start Web Call</button>
          <button id="stop-call" type="button" disabled>Stop Call</button>
        </div>
      </form>

      <section>
        <strong>Status</strong>
        <pre id="status">Idle</pre>
      </section>
    </main>

    <script type="module">
      import { RetellWebClient } from "https://esm.sh/retell-client-js-sdk";

      const form = document.querySelector("#call-form");
      const startButton = document.querySelector("#start-call");
      const stopButton = document.querySelector("#stop-call");
      const statusBox = document.querySelector("#status");
      const retellWebClient = new RetellWebClient();

      function setStatus(value) {
        if (typeof value === "string") {
          statusBox.textContent = value;
          return;
        }

        statusBox.textContent = JSON.stringify(value, null, 2);
      }

      function readPayload() {
        return {
          order_id: document.querySelector("#order-id").value.trim(),
          opportunity_id: document.querySelector("#opportunity-id").value.trim() || undefined,
          customer_email: document.querySelector("#customer-email").value.trim() || undefined,
          customer_name: document.querySelector("#customer-name").value.trim() || undefined,
        };
      }

      retellWebClient.on("call_started", () => {
        setStatus("Call started. Speak into your microphone.");
        stopButton.disabled = false;
      });

      retellWebClient.on("call_ended", () => {
        setStatus("Call ended.");
        startButton.disabled = false;
        stopButton.disabled = true;
      });

      retellWebClient.on("update", (update) => {
        setStatus(update);
      });

      retellWebClient.on("error", (error) => {
        setStatus({
          error: error?.message ?? String(error),
        });
        startButton.disabled = false;
        stopButton.disabled = true;
        retellWebClient.stopCall();
      });

      form.addEventListener("submit", async (event) => {
        event.preventDefault();

        startButton.disabled = true;
        stopButton.disabled = true;
        setStatus("Creating web call...");

        try {
          const response = await fetch("/api/test/web-call", {
            method: "POST",
            headers: {
              authorization: "Bearer " + document.querySelector("#api-key").value.trim(),
              "content-type": "application/json",
            },
            body: JSON.stringify(readPayload()),
          });
          const body = await response.json();

          if (!response.ok) {
            setStatus(body);
            startButton.disabled = false;
            return;
          }

          setStatus({
            callId: body.callId,
            order: body.order,
            status: "Starting browser audio...",
          });

          await retellWebClient.startCall({
            accessToken: body.accessToken,
          });
        } catch (error) {
          setStatus({
            error: error?.message ?? String(error),
          });
          startButton.disabled = false;
        }
      });

      stopButton.addEventListener("click", () => {
        retellWebClient.stopCall();
        stopButton.disabled = true;
      });
    </script>
  </body>
</html>`;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/gu, "&amp;")
    .replace(/</gu, "&lt;")
    .replace(/>/gu, "&gt;")
    .replace(/"/gu, "&quot;")
    .replace(/'/gu, "&#39;");
}
