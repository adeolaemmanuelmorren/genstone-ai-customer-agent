import type { CustomerAgentEnv } from "../../types/env";
import {
  isRecord,
  readJson,
  readString,
  requireConfiguration,
} from "../providers/provider-utils";
import { fetchProvider } from "../providers/provider-fetch";

const WOO_BASE_URL = "https://genstone.com/wp-json/wc/v3";

export interface WooOrderCandidate {
  id: string;
  number: string;
  email?: string;
  phone?: string;
  status?: string;
  createdAt?: string;
  items: Array<{ name: string; quantity: number }>;
  metadata: Array<{ key: string; value: unknown }>;
}

export interface StoredShipment {
  carrier?: string;
  trackingNumbers: string[];
  shippedDate?: string;
}

export async function findWooOrders(
  env: CustomerAgentEnv,
  input: {
    identifierType: "caller_phone" | "alternate_phone" | "order_number";
    identifier: string;
  },
): Promise<WooOrderCandidate[]> {
  if (input.identifierType === "order_number") {
    const order = await readWooOrderById(env, input.identifier.trim());
    return order ? [await includeSiblingOrder(env, order)] : [];
  }

  const normalizedPhone = normalizeUsPhone(input.identifier);
  if (!normalizedPhone) {
    return [];
  }

  let primaryFailure: unknown;
  try {
    const primaryOrders = await searchWooOrders(env, normalizedPhone);
    const primaryMatches = filterOrdersByPhone(primaryOrders, normalizedPhone);
    if (primaryMatches.length > 0) {
      return Promise.all(primaryMatches.map((order) => includeSiblingOrder(env, order)));
    }
  } catch (error) {
    primaryFailure = error;
  }

  const responses = await Promise.allSettled(
    createPhoneSearchVariants(normalizedPhone)
      .slice(1)
      .map((variant) => searchWooOrders(env, variant)),
  );
  const successfulResponses = responses.flatMap((response) =>
    response.status === "fulfilled" ? [response.value] : []
  );

  if (successfulResponses.length === 0) {
    const firstFailure = responses.find((response) => response.status === "rejected");
    throw primaryFailure ?? firstFailure?.reason ?? new Error("Order lookup failed.");
  }

  const uniqueOrders = new Map<string, WooOrderCandidate>();
  for (const order of successfulResponses.flat()) {
    uniqueOrders.set(order.id, order);
  }

  const matches = filterOrdersByPhone([...uniqueOrders.values()], normalizedPhone);
  return Promise.all(matches.map((order) => includeSiblingOrder(env, order)));
}

function filterOrdersByPhone(
  orders: WooOrderCandidate[],
  normalizedPhone: string,
): WooOrderCandidate[] {
  return orders.filter((order) => normalizeUsPhone(order.phone) === normalizedPhone);
}

export async function getWooOrder(
  env: CustomerAgentEnv,
  orderId: string,
): Promise<WooOrderCandidate> {
  const order = await readWooOrderById(env, orderId);
  if (!order) {
    throw new Error("WooCommerce order was not found.");
  }

  return includeSiblingOrder(env, order);
}

export function getStoredShipment(order: WooOrderCandidate): StoredShipment | undefined {
  const carrier = readMetadataString(order.metadata, "_custom_tracking_provider")
    ?? readMetadataString(order.metadata, "_tracking_provider");
  const trackingNumbers = [...new Set(
    order.metadata
      .filter((entry) => entry.key === "gs_tracking_numbers" || entry.key === "_tracking_number")
      .flatMap((entry) => readTrackingNumbers(entry.value)),
  )];
  const shippedDate = normalizeShipmentDate(
    readMetadataValue(order.metadata, "_date_shipped"),
  );

  if (trackingNumbers.length === 0) {
    return undefined;
  }

  return { carrier, trackingNumbers, shippedDate };
}

export function getTrackingUrl(
  carrier: string | undefined,
  trackingNumber: string,
): string | undefined {
  const normalizedCarrier = carrier?.toLowerCase() ?? "";
  const encodedTrackingNumber = encodeURIComponent(trackingNumber);

  if (normalizedCarrier.includes("ups")) {
    return `https://www.ups.com/track?tracknum=${encodedTrackingNumber}`;
  }
  if (normalizedCarrier.includes("fedex")) {
    return `https://www.fedex.com/fedextrack/?trknbr=${encodedTrackingNumber}`;
  }
  if (normalizedCarrier.includes("usps") || normalizedCarrier.includes("postal")) {
    return `https://tools.usps.com/go/TrackConfirmAction?tLabels=${encodedTrackingNumber}`;
  }
  if (normalizedCarrier.includes("dhl")) {
    return `https://www.dhl.com/us-en/home/tracking.html?tracking-id=${encodedTrackingNumber}`;
  }

  return undefined;
}

export function normalizeUsPhone(value: string | undefined): string | undefined {
  if (!value) {
    return undefined;
  }

  const digits = value.replace(/\D/g, "");
  if (digits.length === 11 && digits.startsWith("1")) {
    return digits.slice(1);
  }

  return digits.length === 10 ? digits : undefined;
}

function parseWooOrder(value: unknown): WooOrderCandidate[] {
  if (!isRecord(value)) {
    return [];
  }

  const id = typeof value.id === "number" ? String(value.id) : readString(value.id);
  const number = readString(value.number) ?? id;
  if (!id || !number) {
    return [];
  }

  const billing = isRecord(value.billing) ? value.billing : {};
  const lineItems = Array.isArray(value.line_items) ? value.line_items : [];
  const metadata = Array.isArray(value.meta_data)
    ? value.meta_data.flatMap((entry) => {
      if (!isRecord(entry) || typeof entry.key !== "string") {
        return [];
      }
      return [{ key: entry.key, value: entry.value }];
    })
    : [];

  return [{
    id,
    number,
    email: readString(billing.email),
    phone: readString(billing.phone),
    status: readString(value.status),
    createdAt: readString(value.date_created_gmt),
    items: lineItems.flatMap((item) => {
      if (!isRecord(item)) {
        return [];
      }
      const name = readString(item.name);
      const quantity = typeof item.quantity === "number" ? item.quantity : 0;
      return name ? [{ name, quantity }] : [];
    }),
    metadata,
  }];
}

function readMetadataValue(
  metadata: Array<{ key: string; value: unknown }>,
  key: string,
): unknown {
  return metadata.find((entry) => entry.key === key)?.value;
}

function readMetadataString(
  metadata: Array<{ key: string; value: unknown }>,
  key: string,
): string | undefined {
  return readString(readMetadataValue(metadata, key));
}

function readTrackingNumbers(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.flatMap((item) => readString(item) ?? []);
  }

  const text = readString(value);
  if (!text) {
    return [];
  }

  return text.split(/[,\s]+/u).map((item) => item.trim()).filter(Boolean);
}

async function searchWooOrders(
  env: CustomerAgentEnv,
  search: string,
): Promise<WooOrderCandidate[]> {
  const url = new URL(`${WOO_BASE_URL}/orders`);
  url.searchParams.set("search", search);
  url.searchParams.set("per_page", "100");
  url.searchParams.set("orderby", "date");
  url.searchParams.set("order", "desc");

  const response = await wooFetch(env, url);
  if (!response.ok) {
    throw new Error(`WooCommerce lookup failed with ${response.status}.`);
  }

  const body = await readJson(response);
  if (!Array.isArray(body)) {
    throw new Error("WooCommerce lookup returned an invalid response.");
  }

  return body.flatMap(parseWooOrder);
}

async function readWooOrderById(
  env: CustomerAgentEnv,
  orderId: string,
): Promise<WooOrderCandidate | undefined> {
  const url = new URL(`${WOO_BASE_URL}/orders/${encodeURIComponent(orderId)}`);
  const response = await wooFetch(env, url);
  if (response.status === 404) {
    return undefined;
  }
  if (!response.ok) {
    throw new Error(`WooCommerce order read failed with ${response.status}.`);
  }

  return parseWooOrder(await readJson(response))[0];
}

async function includeSiblingOrder(
  env: CustomerAgentEnv,
  order: WooOrderCandidate,
): Promise<WooOrderCandidate> {
  const siblingId = readMetadataIdentifier(order.metadata, "gs_sibling_id");
  if (!siblingId || siblingId === order.id) {
    return order;
  }

  const sibling = await readWooOrderById(env, siblingId);
  if (!sibling) {
    return order;
  }

  return {
    ...order,
    email: order.email ?? sibling.email,
    phone: order.phone ?? sibling.phone,
    items: [...order.items, ...sibling.items],
    metadata: [...order.metadata, ...sibling.metadata],
  };
}

function readMetadataIdentifier(
  metadata: Array<{ key: string; value: unknown }>,
  key: string,
): string | undefined {
  const value = readMetadataValue(metadata, key);
  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }
  return readString(value);
}

function createPhoneSearchVariants(phone: string): string[] {
  const areaCode = phone.slice(0, 3);
  const prefix = phone.slice(3, 6);
  const lineNumber = phone.slice(6);

  return [
    phone,
    `${areaCode}-${prefix}-${lineNumber}`,
    `(${areaCode}) ${prefix}-${lineNumber}`,
    `+1${phone}`,
    `+1 ${areaCode} ${prefix} ${lineNumber}`,
  ];
}

function normalizeShipmentDate(value: unknown): string | undefined {
  const raw = typeof value === "number" ? String(value) : readString(value);
  if (!raw) {
    return undefined;
  }

  const numeric = Number(raw);
  const timestamp = Number.isFinite(numeric)
    ? numeric * (numeric > 10_000_000_000 ? 1 : 1000)
    : Date.parse(raw);
  const date = new Date(timestamp);

  return Number.isNaN(date.getTime()) ? raw : date.toISOString().slice(0, 10);
}

function wooFetch(env: CustomerAgentEnv, url: URL): Promise<Response> {
  const key = requireConfiguration(env.WOO_CONSUMER_KEY, "WOO_CONSUMER_KEY");
  const secret = requireConfiguration(env.WOO_CONSUMER_SECRET, "WOO_CONSUMER_SECRET");
  return fetchProvider(url, {
    headers: { Authorization: `Basic ${btoa(`${key}:${secret}`)}` },
  });
}
