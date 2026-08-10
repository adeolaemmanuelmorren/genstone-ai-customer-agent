import type { Queryable } from "../persistence/db";
import type { CustomerAgentEnv } from "../../types/env";
import type {
  CallbackScheduleInput,
  ContactLookupInput,
  DncSuppressInput,
  EmployeeLookupInput,
  OrderLookupInput,
  ProspectFollowUpInput,
  ShipmentEmailInput,
  SupportCaseCreateInput,
  VerifiedOrderInput,
} from "../../schemas/retell-tools";
import { failureResult, successResult, type ToolResult } from "../../types/tool-result";
import { CUSTOMERIO_MESSAGES } from "../customerio/config";
import { sendCustomerIoEmail } from "../customerio/client";
import { suppressFive9Number } from "../five9/client";
import {
  getContactReference,
  getOrderReference,
  storeContactReference,
  storeOrderReference,
} from "../persistence/references-repository";
import {
  lookupActiveEmployees,
  lookupSalesforceContact,
  SalesforceLookupError,
} from "../salesforce/client";
import { createZendeskCase } from "../zendesk/client";
import {
  findWooOrders,
  getStoredShipment,
  getTrackingUrl,
  getWooOrder,
  maskEmail,
  normalizeUsPhone,
} from "../woocommerce/client";

export async function lookupContactTool(
  env: CustomerAgentEnv,
  db: Queryable,
  input: ContactLookupInput,
): Promise<ToolResult> {
  try {
    const contact = await lookupSalesforceContact(env, input);
    const reference = await storeContactReference(db, {
      companyId: getCompanyId(env),
      callId: input.call_id,
      salesforceContactId: contact.id,
      name: contact.name,
      phone: input.phone ?? contact.phone,
      email: input.email ?? contact.email,
    });

    return successResult("found", "A matching customer contact was found.", {
      contact_token: reference.token,
      customer_name: contact.name,
    });
  } catch (error) {
    if (error instanceof SalesforceLookupError && error.status === 404) {
      return successResult("not_found", "No matching customer contact was found.");
    }
    if (error instanceof SalesforceLookupError && error.status === 409) {
      return successResult("ambiguous", "More than one customer contact matched.");
    }
    throw error;
  }
}

export async function lookupEmployeeTool(
  env: CustomerAgentEnv,
  _db: Queryable,
  input: EmployeeLookupInput,
): Promise<ToolResult> {
  const employees = await lookupActiveEmployees(env, input.employee_name);
  const requestedName = normalizeName(input.employee_name);
  const exactMatches = employees.filter(
    (employee) => normalizeName(employee.name) === requestedName,
  );

  if (exactMatches.length === 0) {
    const resultCode = employees.length > 0 ? "ambiguous" : "not_found";
    return successResult(resultCode, "No unique active employee match was found.");
  }
  if (exactMatches.length > 1) {
    return successResult("ambiguous", "More than one active employee matched that name.");
  }

  const employee = exactMatches[0];
  if (!employee.phone) {
    return successResult("missing_number", "The employee does not have an eligible transfer number.");
  }

  return successResult("found", "A unique active employee was found.", {
    employee_name: employee.name,
    transfer_destination: employee.phone,
  });
}

export async function lookupOrderTool(
  env: CustomerAgentEnv,
  db: Queryable,
  input: OrderLookupInput,
): Promise<ToolResult> {
  if (input.identifier_type !== "order_number" && !normalizeUsPhone(input.identifier)) {
    return failureResult("validation_failed", "The phone number could not be validated.");
  }

  const matches = await findWooOrders(env, {
    identifierType: input.identifier_type,
    identifier: input.identifier,
  });
  if (matches.length === 0) {
    return successResult("not_found", "No matching order was found.");
  }

  const order = sortNewestOrder(matches)[0];
  if (!order) {
    return successResult("not_found", "No matching order was found.");
  }

  const reference = await storeOrderReference(db, {
    companyId: getCompanyId(env),
    callId: input.call_id,
    wooOrderId: order.id,
    orderNumber: order.number,
    orderEmail: order.email,
    orderPhone: order.phone,
    maskedEmail: maskEmail(order.email),
    items: order.items,
  });

  const itemSummary = summarizeItems(order.items);
  return successResult("found", "A candidate order was found and requires confirmation.", {
    order_candidate_token: reference.token,
    order_item_summary: itemSummary,
    order_email_masked: reference.maskedEmail,
    order_status_summary: order.status,
  });
}

export async function lookupShipmentTool(
  env: CustomerAgentEnv,
  db: Queryable,
  input: VerifiedOrderInput,
): Promise<ToolResult> {
  const reference = await requireVerifiedOrderReference(env, db, input);
  if (!reference) {
    return failureResult("error", "Order verification could not be confirmed.");
  }

  const order = await getWooOrder(env, reference.wooOrderId);
  const shipment = getStoredShipment(order);
  if (!shipment) {
    return successResult("shipment_unavailable", "No stored shipment details are available.");
  }

  const summary = summarizeShipment(shipment);
  return successResult("found", summary, {
    shipment_safe_summary: summary,
    carrier: shipment.carrier,
    tracking_numbers: shipment.trackingNumbers,
    shipped_date: shipment.shippedDate,
  });
}

export async function scheduleCallbackTool(
  env: CustomerAgentEnv,
  _db: Queryable,
  input: CallbackScheduleInput,
): Promise<ToolResult> {
  if (!isValidCallbackDateTime(input.callback_date, input.callback_time)) {
    return failureResult(
      "invalid_day_or_time",
      "Choose a non-holiday weekday, next business day or later, from 8:30 AM through 4:30 PM Mountain time.",
    );
  }

  try {
    const deliveryReference = await sendCustomerIoEmail(env, {
      transactionalMessageId: CUSTOMERIO_MESSAGES.callbackRequest.transactionalMessageId,
      recipient: CUSTOMERIO_MESSAGES.callbackRequest.recipient,
      messageData: {
        subject: input.callback_subject,
        description: input.callback_summary,
        preferred_date: input.callback_date,
        preferred_time_mountain: input.callback_time,
        callback_phone: input.callback_phone,
        urgency_signals: input.urgency_context ?? "",
        original_time_context: "Mountain time",
        call_reference: input.call_id,
        request_reference: input.idempotency_key,
        priority: input.urgency_context ? "Context provided" : "Standard",
        caller_type: "GenStone caller",
        customer_name: input.customer_name,
        customer_email: "",
        requested_employee: "",
        order_or_project_references: "",
      },
    });
    return successResult("scheduled", "The callback request was scheduled.", {
      external_reference: deliveryReference,
    });
  } catch {
    return failureResult("delivery_failed", "The callback request could not be delivered.");
  }
}

export async function sendProspectFollowUpTool(
  env: CustomerAgentEnv,
  _db: Queryable,
  input: ProspectFollowUpInput,
): Promise<ToolResult> {
  try {
    const deliveryReference = await sendCustomerIoEmail(env, {
      transactionalMessageId: CUSTOMERIO_MESSAGES.unmatchedProspect.transactionalMessageId,
      recipient: CUSTOMERIO_MESSAGES.unmatchedProspect.recipient,
      messageData: {
        customer_name: input.customer_name,
        phone: input.confirmed_phone,
        email: input.customer_email ?? "",
        description: input.project_summary,
        zip: input.postal_code ?? "",
        timing: "",
        product_or_use: input.project_summary,
        caller_type: "New project",
        call_reference: input.call_id,
        request_reference: input.idempotency_key,
      },
    });

    return successResult("sent", "The project follow-up information was sent to the team.", {
      external_reference: deliveryReference,
    });
  } catch {
    return failureResult("delivery_failed", "The project follow-up information could not be delivered.");
  }
}

export async function emailShipmentTool(
  env: CustomerAgentEnv,
  db: Queryable,
  input: ShipmentEmailInput,
): Promise<ToolResult> {
  const reference = await requireVerifiedOrderReference(env, db, input);
  if (!reference?.orderEmail) {
    return failureResult("error", "The confirmed order email is unavailable.");
  }

  const order = await getWooOrder(env, reference.wooOrderId);
  const shipment = getStoredShipment(order);
  if (!shipment) {
    return successResult("shipment_unavailable", "No stored shipment details are available.");
  }

  try {
    const deliveryReference = await sendCustomerIoEmail(env, {
      transactionalMessageId: CUSTOMERIO_MESSAGES.shipmentDetails.transactionalMessageId,
      recipient: reference.orderEmail,
      messageData: {
        order_number: reference.orderNumber,
        shipments: shipment.trackingNumbers.map((trackingNumber) => ({
          carrier: shipment.carrier ?? "Carrier not stored",
          tracking_number: trackingNumber,
          tracking_url: getTrackingUrl(shipment.carrier, trackingNumber) ?? "",
          shipped_date: shipment.shippedDate ?? "",
        })),
      },
    });
    return successResult("sent", "The stored shipment details were emailed to the confirmed order address.", {
      external_reference: deliveryReference,
    });
  } catch {
    return failureResult("delivery_failed", "The shipment email could not be delivered.");
  }
}

export async function createSupportCaseTool(
  env: CustomerAgentEnv,
  db: Queryable,
  input: SupportCaseCreateInput,
): Promise<ToolResult> {
  const orderReference = input.order_candidate_token
    ? await getOrderReference(
      db,
      getCompanyId(env),
      input.call_id,
      input.order_candidate_token,
    )
    : undefined;
  if (input.order_candidate_token && !orderReference) {
    return failureResult("validation_failed", "The confirmed order reference could not be validated.");
  }

  const comment = buildPrivateSupportComment(input, orderReference?.orderNumber);
  const ticketMetadata = {
    customerName: input.customer_name,
    phone: input.confirmed_phone,
    callerType: input.caller_type,
    country: input.caller_country,
  };

  const ticket = await createZendeskCase(env, {
    subject: `GenStone caller follow-up: ${input.support_summary.slice(0, 120)}`,
    privateComment: comment,
    metadata: ticketMetadata,
  });

  try {
    await sendCustomerIoEmail(env, {
      transactionalMessageId: CUSTOMERIO_MESSAGES.supportCaseCreated.transactionalMessageId,
      recipient: CUSTOMERIO_MESSAGES.supportCaseCreated.recipient,
      messageData: {
        customer_name: input.customer_name ?? "",
        confirmed_phone: input.confirmed_phone ?? "",
        customer_email: input.customer_email ?? "",
        caller_type: input.caller_type ?? "",
        support_summary: input.support_summary,
        order_reference: orderReference?.orderNumber ?? "",
        communication_preference: input.communication_preference ?? "",
        urgency_context: input.urgency_context ?? "",
        photo_context: input.photo_context ?? "",
        zendesk_case_id: ticket.id,
        request_reference: input.idempotency_key,
        call_reference: input.call_id,
      },
    });
  } catch {
    return {
      ...failureResult(
        "created_notice_failed",
        "The support follow-up was created, but its internal notice could not be delivered.",
      ),
      data: { external_reference: ticket.id },
    };
  }

  return successResult("created", "The support follow-up was created.", {
    external_reference: ticket.id,
  });
}

export async function suppressDncTool(
  env: CustomerAgentEnv,
  _db: Queryable,
  input: DncSuppressInput,
): Promise<ToolResult> {
  const phone = normalizeUsPhone(input.dnc_phone);
  if (!phone) {
    return failureResult("validation_failed", "The phone number could not be validated.");
  }

  const result = await suppressFive9Number(env, phone);
  return successResult(result, "The do-not-call request was handled.");
}

function getCompanyId(env: CustomerAgentEnv): string {
  return env.GENSTONE_COMPANY_ID || "genstone";
}

function normalizeName(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function sortNewestOrder<T extends { id: string; createdAt?: string }>(orders: T[]): T[] {
  return [...orders].sort((left, right) => {
    const dateComparison = (right.createdAt ?? "").localeCompare(left.createdAt ?? "");
    return dateComparison || right.id.localeCompare(left.id, undefined, { numeric: true });
  });
}

function summarizeItems(items: Array<{ name: string; quantity: number }>): string {
  if (items.length === 0) {
    return "Order items are not available.";
  }
  return items.slice(0, 6).map((item) => `${item.quantity} × ${item.name}`).join(", ");
}

function summarizeShipment(shipment: {
  carrier?: string;
  trackingNumbers: string[];
  shippedDate?: string;
}): string {
  const parts = [];
  if (shipment.carrier) {
    parts.push(`Carrier: ${shipment.carrier}`);
  }
  if (shipment.trackingNumbers.length > 0) {
    parts.push(`Tracking: ${shipment.trackingNumbers.join(", ")}`);
  }
  if (shipment.shippedDate) {
    parts.push(`Stored shipped date: ${shipment.shippedDate}`);
  }
  return parts.join(". ");
}

async function requireVerifiedOrderReference(
  env: CustomerAgentEnv,
  db: Queryable,
  input: VerifiedOrderInput,
) {
  if (!input.order_items_confirmed || !input.order_email_confirmed || !input.order_verified) {
    return undefined;
  }
  return getOrderReference(
    db,
    getCompanyId(env),
    input.call_id,
    input.order_candidate_token,
  );
}

function buildPrivateSupportComment(
  input: SupportCaseCreateInput,
  orderNumber?: string,
): string {
  return [
    `Summary: ${input.support_summary}`,
    `Call reference: ${input.call_id}`,
    `Customer name: ${input.customer_name ?? "Not provided"}`,
    `Confirmed phone: ${input.confirmed_phone ?? "Not provided"}`,
    `Customer email: ${input.customer_email ?? "Not provided"}`,
    `Caller type: ${input.caller_type}`,
    `Country: ${input.caller_country ?? "Not provided"}`,
    `Order reference: ${orderNumber ?? "Not provided"}`,
    `Communication preference: ${input.communication_preference ?? "Not provided"}`,
    `Urgency context: ${input.urgency_context ?? "Not provided"}`,
    `Photo context: ${input.photo_context ?? "Not provided"}`,
  ].join("\n");
}

export function isValidCallbackDateTime(
  dateText: string,
  timeText: string,
  now: Date = new Date(),
): boolean {
  const [year, month, day] = dateText.split("-").map(Number);
  const [hour, minute] = timeText.split(":").map(Number);
  const proposedDay = new Date(Date.UTC(year, month - 1, day));
  const tomorrowMountain = getTomorrowInMountainTime(now);

  if (
    proposedDay.getUTCFullYear() !== year
    || proposedDay.getUTCMonth() !== month - 1
    || proposedDay.getUTCDate() !== day
  ) {
    return false;
  }

  if (proposedDay < tomorrowMountain) {
    return false;
  }

  const weekday = proposedDay.getUTCDay();
  if (weekday === 0 || weekday === 6 || isFederalHoliday(proposedDay)) {
    return false;
  }

  const minutes = hour * 60 + minute;
  if (minutes < 8 * 60 + 30 || minutes > 16 * 60 + 30) {
    return false;
  }

  return true;
}

function getTomorrowInMountainTime(now: Date): Date {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Denver",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const parts = Object.fromEntries(
    formatter.formatToParts(now).map((part) => [part.type, part.value]),
  );
  const today = new Date(Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day)));
  today.setUTCDate(today.getUTCDate() + 1);
  return today;
}

function isFederalHoliday(date: Date): boolean {
  const year = date.getUTCFullYear();
  const dates = [
    observedFixedHoliday(year, 0, 1),
    nthWeekday(year, 0, 1, 3),
    nthWeekday(year, 1, 1, 3),
    lastWeekday(year, 4, 1),
    observedFixedHoliday(year, 5, 19),
    observedFixedHoliday(year, 6, 4),
    nthWeekday(year, 8, 1, 1),
    nthWeekday(year, 9, 1, 2),
    observedFixedHoliday(year, 10, 11),
    nthWeekday(year, 10, 4, 4),
    observedFixedHoliday(year, 11, 25),
    observedFixedHoliday(year + 1, 0, 1),
  ];
  const key = date.toISOString().slice(0, 10);
  return dates.some((holiday) => holiday.toISOString().slice(0, 10) === key);
}

function observedFixedHoliday(year: number, month: number, day: number): Date {
  const date = new Date(Date.UTC(year, month, day));
  if (date.getUTCDay() === 6) {
    date.setUTCDate(date.getUTCDate() - 1);
  } else if (date.getUTCDay() === 0) {
    date.setUTCDate(date.getUTCDate() + 1);
  }
  return date;
}

function nthWeekday(
  year: number,
  month: number,
  weekday: number,
  occurrence: number,
): Date {
  const date = new Date(Date.UTC(year, month, 1));
  const offset = (weekday - date.getUTCDay() + 7) % 7;
  date.setUTCDate(1 + offset + (occurrence - 1) * 7);
  return date;
}

function lastWeekday(year: number, month: number, weekday: number): Date {
  const date = new Date(Date.UTC(year, month + 1, 0));
  const offset = (date.getUTCDay() - weekday + 7) % 7;
  date.setUTCDate(date.getUTCDate() - offset);
  return date;
}
