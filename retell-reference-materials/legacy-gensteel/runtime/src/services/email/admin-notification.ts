import type { ReviewOutcomeContext } from "../../workflows/review-outcome/review-outcome.types";
import type { ReviewAgentEnv } from "../../types/env";
import { createLogger } from "../../lib/observability/logger";
import { recordOutcomeAction } from "../persistence/review-agent-repository";

const GIFTCARD_ZAPIER_URL = "[REDACTED_LEGACY_ZAPIER_WEBHOOK_URL]";
const REVIEW_GIFTCARD_TYPE = "gensteel_review_50";

export interface AdminReviewEmailOptions {
  reviewDestination?: string;
}

export async function sendAdminReviewEmail(
  env: ReviewAgentEnv,
  context: ReviewOutcomeContext,
  options: AdminReviewEmailOptions = {},
): Promise<void> {
  const from = requireEnv(env.INTERNAL_STAFF_EMAIL_FROM, "INTERNAL_STAFF_EMAIL_FROM");
  const recipients = parseRecipients(requireEnv(env.INTERNAL_STAFF_EMAIL_TO, "INTERNAL_STAFF_EMAIL_TO"));
  const logger = createLogger({
    minLevel: env.ENVIRONMENT === "production" ? "info" : "debug",
    context: {
      provider: "cloudflare-email",
      action: "send-admin-review-email",
      callId: context.callId,
      orderId: context.orderId,
    },
  });

  if (recipients.length === 0) {
    throw new Error("INTERNAL_STAFF_EMAIL_TO did not include any valid recipients.");
  }

  logger.info("Sending admin review email", {
    recipients,
    outcome: context.callOutcome,
    executionMode: context.executionMode ?? "production",
    testRunId: context.testRunId,
  });

  const messageIds: string[] = [];
  for (const recipient of recipients) {
    const result = await env.EMAIL.send({
      from,
      to: recipient,
      subject: buildSubject(context),
      text: buildTextBody(context, options),
      html: buildHtmlBody(context, options),
    });

    messageIds.push(result.messageId);
  }

  logger.info("Admin review email sent", {
    recipientCount: recipients.length,
    messageIds,
  });

  await recordOutcomeAction(env, {
    context,
    actionType: "admin_review_email",
    status: "completed",
    provider: "cloudflare_email",
    providerMessageId: messageIds.join(","),
    reviewDestination: options.reviewDestination,
    payload: {
      from,
      recipients,
      messageIds,
      outcome: context.callOutcome,
      executionMode: context.executionMode ?? "production",
      testRunId: context.testRunId,
      retellPublicLogUrl: context.retellPublicLogUrl,
      retellRecordingUrl: context.retellRecordingUrl,
      giftcardUrl: buildGiftcardUrl(context, options),
    },
  });
}

function buildSubject(context: ReviewOutcomeContext): string {
  const prefix = isTestContext(context) ? "[TEST] " : "";
  const escalation = context.callOutcome === "negative_escalation_needed" ? "ESCALATION: " : "";
  const outcome = context.callOutcome ?? "unknown outcome";
  const order = context.orderNumber ?? context.orderId ?? context.callId;

  return `${prefix}${escalation}GenSteel review call ${outcome} - ${order}`;
}

function buildTextBody(
  context: ReviewOutcomeContext,
  options: AdminReviewEmailOptions,
): string {
  const lines = [
    ...buildTestTextLines(context),
    buildHeading(context),
    "",
    `Outcome: ${context.callOutcome ?? "unknown"}`,
    `Execution: ${isTestContext(context) ? "test" : "production"}`,
    `Order: ${context.orderNumber ?? context.orderId ?? "unknown"}`,
    `Customer: ${context.customerName ?? "unknown"}`,
    `Email: ${context.customerEmail ?? "unknown"}`,
    `Call ID: ${context.callId}`,
    "",
    `Summary: ${context.callSummary ?? "No summary captured."}`,
    `Issue: ${context.issueSummary ?? "No issue captured."}`,
  ];

  if (context.retellPublicLogUrl) {
    lines.push("", `Retell transcript/log: ${context.retellPublicLogUrl}`);
  }

  if (context.retellRecordingUrl) {
    lines.push(`Recording: ${context.retellRecordingUrl}`);
  }

  const giftcardUrl = buildGiftcardUrl(context, options);
  if (giftcardUrl) {
    lines.push("", `Trigger Giftcard Zapier Flow: ${giftcardUrl}`);
  }

  return lines.join("\n");
}

function buildHtmlBody(
  context: ReviewOutcomeContext,
  options: AdminReviewEmailOptions,
): string {
  const rows = [
    ["Outcome", context.callOutcome ?? "unknown"],
    ["Execution", isTestContext(context) ? "test" : "production"],
    ["Order", context.orderNumber ?? context.orderId ?? "unknown"],
    ["Customer", context.customerName ?? "unknown"],
    ["Email", context.customerEmail ?? "unknown"],
    ["Call ID", context.callId],
  ];
  const giftcardUrl = buildGiftcardUrl(context, options);

  return `
    ${buildTestHtml(context)}
    <h2>${escapeHtml(buildHeading(context))}</h2>
    ${context.callOutcome === "negative_escalation_needed"
      ? "<p><strong style=\"color:#b42318;\">ESCALATION NEEDED</strong></p>"
      : ""}
    <table cellpadding="6" cellspacing="0" style="border-collapse:collapse;">
      ${rows.map(([label, value]) => `
        <tr>
          <td><strong>${escapeHtml(label)}</strong></td>
          <td>${escapeHtml(value)}</td>
        </tr>
      `).join("")}
    </table>
    <h3>Summary</h3>
    <p>${escapeHtml(context.callSummary ?? "No summary captured.")}</p>
    <h3>Issue</h3>
    <p>${escapeHtml(context.issueSummary ?? "No issue captured.")}</p>
    ${buildLinkButton(context.retellPublicLogUrl, "Open Retell Transcript / Log")}
    ${buildLinkButton(context.retellRecordingUrl, "Listen to Recording")}
    ${buildLinkButton(giftcardUrl, "Trigger Giftcard Zapier Flow")}
  `;
}

function buildHeading(context: ReviewOutcomeContext): string {
  const prefix = isTestContext(context) ? "[TEST] " : "";

  if (context.callOutcome === "negative_escalation_needed") {
    return `${prefix}ESCALATION: GenSteel Review Call Outcome`;
  }

  return `${prefix}GenSteel Review Call Outcome`;
}

function buildGiftcardUrl(
  context: ReviewOutcomeContext,
  options: AdminReviewEmailOptions,
): string | undefined {
  if (context.callOutcome !== "positive_review_email_needed") {
    return undefined;
  }

  if (!context.customerEmail) {
    return undefined;
  }

  const url = new URL(GIFTCARD_ZAPIER_URL);
  url.searchParams.set("email", context.customerEmail);
  url.searchParams.set("giftcard_type", REVIEW_GIFTCARD_TYPE);

  if (options.reviewDestination) {
    url.searchParams.set("review_destination", options.reviewDestination);
  }

  return url.toString();
}

function buildLinkButton(url: string | undefined, label: string): string {
  if (!url) {
    return "";
  }

  return `
    <p>
      <a href="${escapeHtml(url)}" style="display:inline-block;padding:10px 14px;background:#1f2937;color:#ffffff;text-decoration:none;border-radius:4px;">
        ${escapeHtml(label)}
      </a>
    </p>
  `;
}

function buildTestTextLines(context: ReviewOutcomeContext): string[] {
  if (!isTestContext(context)) {
    return [];
  }

  return [
    "[TEST RUN]",
    `Test Run ID: ${context.testRunId ?? "unknown"}`,
    `Source Order ID: ${context.sourceOrderId ?? context.orderId ?? "unknown"}`,
    "",
  ];
}

function buildTestHtml(context: ReviewOutcomeContext): string {
  if (!isTestContext(context)) {
    return "";
  }

  return `
    <p><strong>TEST RUN</strong></p>
    <p><strong>Test Run ID:</strong> ${escapeHtml(context.testRunId ?? "unknown")}</p>
    <p><strong>Source Order ID:</strong> ${escapeHtml(context.sourceOrderId ?? context.orderId ?? "unknown")}</p>
  `;
}

function parseRecipients(value: string): string[] {
  return Array.from(new Set(
    value
      .split(/[,;\s]+/u)
      .map((recipient) => recipient.trim())
      .filter(Boolean),
  ));
}

function isTestContext(context: ReviewOutcomeContext): boolean {
  return context.executionMode === "test" || context.isTestCall === true;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function requireEnv(value: string | undefined, name: string): string {
  if (value) {
    return value;
  }

  throw new Error(`Missing required environment variable: ${name}.`);
}
