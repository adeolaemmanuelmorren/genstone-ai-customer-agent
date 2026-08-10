import type { OrderCreatedPayload, NormalizedOrderCreated } from "../../schemas/order-created";
import type { ReviewAgentEnv } from "../../types/env";
import { createLogger } from "../../lib/observability/logger";

export type SalesforceRecord = Record<string, unknown>;

export type SalesforceReviewOrderSummary = {
  orderId: string;
  orderNumber?: string;
  createdDate?: string;
  opportunityId?: string;
  opportunityName?: string;
  accountId?: string;
  customerId?: string;
  customerEmail?: string;
  customerPhone?: string;
  buildingDescription?: string;
  buildingType?: string;
  buildingSystem?: string;
  buildingSize?: string;
  salesRepName?: string;
  deliveryCoordinatorName?: string;
  projectCoordinatorName?: string;
};

export type SalesforceBuildingDetails = {
  orderBuildingType?: string;
  orderBuildingSystem?: string;
  opportunityBuildingType?: string;
  opportunityBuildingSystem?: string;
  buildingType?: string;
  buildingSystem?: string;
  buildingSize?: string;
  description?: string;
};

export type SalesforceOrderLifecycleEventContext = {
  orderId: string;
  orderNumber?: string;
  opportunityId?: string;
  customerId?: string;
  customerEmail?: string;
  customerIoPersonId?: string;
  salesforceAccountId?: string;
  deliveryDate?: string;
  status?: string;
};

type SalesforceListApiResponse = {
  success: boolean;
  data?: {
    records?: SalesforceRecord[];
    filters?: Record<string, unknown>;
  };
  error?: {
    message?: string;
  };
};

const ORDER_FIELDS = [
  "Id",
  "OrderNumber",
  "CreatedDate",
  "Status",
  "Delivery_Date__c",
  "AccountId",
  "OpportunityId",
  "Primary_Contact__c",
  "Primary_Contact_Phone__c",
  "Primary_Contact_Mobile__c",
  "Primary_Contact_Email__c",
  "Delivery_Phone__c",
  "Delivery_Email__c",
  "billto_telephone__c",
  "billto_email__c",
  "shipto_telephone__c",
  "shipto_email__c",
  "Building_Type__c",
  "Building_System__c",
  "Building_Supplier_Order__c",
  "new_widthtxt__c",
  "new_lengthtxt__c",
  "salesmanid__c",
  "salesmanid__r.Name",
  "new_deliverycoordinatorid__c",
  "new_deliverycoordinatorid__r.Name",
  "new_projectcoordinatorid__c",
  "new_projectcoordinatorid__r.Name",
] as const;

const OPPORTUNITY_FIELDS = [
  "Id",
  "Name",
  "AccountId",
  "ContactId",
  "StageName",
  "CreatedDate",
  "new_firstname__c",
  "new_lastname__c",
  "new_email__c",
  "new_phone__c",
  "Mobile_Phone__c",
  "Primary_Phone__c",
  "Primary_Mobile_Phone__c",
  "Primary_Contact_Email__c",
  "Reporting_Phone__c",
  "Opp_Reporting_Phone_Scrub__c",
  "Building_Type__c",
  "Building_System__c",
] as const;

type SalesforceApiResponse = {
  success: boolean;
  data?: {
    record?: SalesforceRecord;
  };
  error?: {
    message?: string;
  };
};

export async function fetchSalesforceOrder(
  env: ReviewAgentEnv,
  orderId: string,
): Promise<SalesforceRecord> {
  return fetchSalesforceRecord(env, "/v1/orders", {
    order_id: orderId,
    fields: ORDER_FIELDS.join(","),
  });
}

export async function checkSalesforceOrderDelivery(
  env: ReviewAgentEnv,
  orderId: string,
): Promise<{ orderDelivered: boolean }> {
  const record = await fetchSalesforceRecord(env, "/v1/orders", {
    order_id: orderId,
    fields: "Id,Status",
  });

  return {
    orderDelivered: readString(record, "Status") === "Delivered",
  };
}

export async function fetchSalesforceOpportunity(
  env: ReviewAgentEnv,
  opportunityId: string,
): Promise<SalesforceRecord> {
  return fetchSalesforceRecord(env, "/v1/opportunities", {
    opportunity_id: opportunityId,
    fields: OPPORTUNITY_FIELDS.join(","),
  });
}

export async function listSalesforceReviewOrders(
  env: ReviewAgentEnv,
  params: {
    days?: number;
    limit?: number;
    q?: string;
  },
): Promise<{
  orders: SalesforceReviewOrderSummary[];
  filters: Record<string, unknown>;
}> {
  const baseUrl = requireEnv(env.CLOUDRUN_SALESFORCE_API_URL, "CLOUDRUN_SALESFORCE_API_URL");
  const apiKey = requireEnv(env.CLOUDRUN_SALESFORCE_API_KEY, "CLOUDRUN_SALESFORCE_API_KEY");
  const url = new URL("/v1/gensteel/review-orders", baseUrl);

  if (params.days) {
    url.searchParams.set("days", String(params.days));
  }

  if (params.limit) {
    url.searchParams.set("limit", String(params.limit));
  }

  if (params.q?.trim()) {
    url.searchParams.set("q", params.q.trim());
  }

  const response = await fetch(url.toString(), {
    method: "GET",
    headers: {
      accept: "application/json",
      "x-api-key": apiKey,
    },
  });
  const body = await readJsonResponse<SalesforceListApiResponse>(response);

  if (!response.ok || !body.success) {
    throw new Error(body.error?.message ?? `Salesforce API request failed with ${response.status}.`);
  }

  const records = body.data?.records ?? [];
  return {
    orders: records.map(toReviewOrderSummary),
    filters: body.data?.filters ?? {},
  };
}

export function buildReviewOrderFromSalesforce(
  payload: OrderCreatedPayload,
  orderRecord: SalesforceRecord,
  opportunityRecord: SalesforceRecord,
): NormalizedOrderCreated {
  const customerPhone = firstPhone([
    readString(orderRecord, "Primary_Contact_Phone__c"),
    readString(orderRecord, "Primary_Contact_Mobile__c"),
    readString(opportunityRecord, "Primary_Phone__c"),
    readString(opportunityRecord, "Primary_Mobile_Phone__c"),
    readString(orderRecord, "Delivery_Phone__c"),
    readString(orderRecord, "billto_telephone__c"),
    readString(orderRecord, "shipto_telephone__c"),
    readString(opportunityRecord, "new_phone__c"),
    readString(opportunityRecord, "Reporting_Phone__c"),
    readString(opportunityRecord, "Opp_Reporting_Phone_Scrub__c"),
  ]);

  if (!customerPhone) {
    throw new Error(`Salesforce order ${payload.data.order_id} did not include a usable phone.`);
  }

  return {
    orderId: readString(orderRecord, "Id") ?? payload.data.order_id,
    orderNumber: readString(orderRecord, "OrderNumber"),
    customerId: readString(orderRecord, "Primary_Contact__c") ?? readString(opportunityRecord, "ContactId"),
    salesforceAccountId: readString(orderRecord, "AccountId") ?? readString(opportunityRecord, "AccountId"),
    customerName: buildCustomerName(opportunityRecord),
    customerPhone,
    customerEmail: firstString([
      payload.data.order_email,
      readString(orderRecord, "Primary_Contact_Email__c"),
      readString(opportunityRecord, "Primary_Contact_Email__c"),
      readString(orderRecord, "Delivery_Email__c"),
      readString(orderRecord, "billto_email__c"),
      readString(orderRecord, "shipto_email__c"),
      readString(opportunityRecord, "new_email__c"),
    ]),
    buildingDescription: buildBuildingDescription(orderRecord, opportunityRecord),
    buildingSize: buildBuildingSize(orderRecord),
    salesRepId: readString(orderRecord, "salesmanid__c"),
    salesRepName: readRelationshipString(orderRecord, "salesmanid__r", "Name"),
    deliveryCoordinatorId: readString(orderRecord, "new_deliverycoordinatorid__c"),
    deliveryCoordinatorName: readRelationshipString(orderRecord, "new_deliverycoordinatorid__r", "Name"),
    projectCoordinatorId: readString(orderRecord, "new_projectcoordinatorid__c"),
    projectCoordinatorName: readRelationshipString(orderRecord, "new_projectcoordinatorid__r", "Name"),
    rawPayload: {
      customerio: payload,
      salesforce: {
        order: orderRecord,
        opportunity: opportunityRecord,
      },
    },
  };
}

export function buildOrderLifecycleEventContext(
  payload: OrderCreatedPayload,
  orderRecord: SalesforceRecord,
  opportunityRecord: SalesforceRecord | undefined,
): SalesforceOrderLifecycleEventContext {
  return {
    orderId: readString(orderRecord, "Id") ?? payload.data.order_id,
    orderNumber: readString(orderRecord, "OrderNumber") ?? payload.data.order_number,
    opportunityId: payload.data.opportunity_id ?? readString(orderRecord, "OpportunityId"),
    customerId: payload.data.customer_id
      ?? readString(orderRecord, "Primary_Contact__c")
      ?? readString(opportunityRecord ?? {}, "ContactId"),
    customerEmail: firstString([
      payload.data.customer_email,
      payload.data.order_email,
      readString(orderRecord, "Primary_Contact_Email__c"),
      readString(opportunityRecord ?? {}, "Primary_Contact_Email__c"),
      readString(orderRecord, "Delivery_Email__c"),
      readString(orderRecord, "billto_email__c"),
      readString(orderRecord, "shipto_email__c"),
      readString(opportunityRecord ?? {}, "new_email__c"),
    ]),
    customerIoPersonId: payload.data.customer_io_person_id,
    salesforceAccountId: payload.data.salesforce_account_id
      ?? readString(orderRecord, "AccountId")
      ?? readString(opportunityRecord ?? {}, "AccountId"),
    deliveryDate: payload.data.delivery_date ?? readString(orderRecord, "Delivery_Date__c"),
    status: readString(orderRecord, "Status"),
  };
}

export function buildSalesforceBuildingDetails(
  orderRecord: SalesforceRecord,
  opportunityRecord: SalesforceRecord,
): SalesforceBuildingDetails {
  const orderBuildingType = readString(orderRecord, "Building_Type__c");
  const orderBuildingSystem = readString(orderRecord, "Building_System__c");
  const opportunityBuildingType = readString(opportunityRecord, "Building_Type__c");
  const opportunityBuildingSystem = readString(opportunityRecord, "Building_System__c");

  return {
    orderBuildingType,
    orderBuildingSystem,
    opportunityBuildingType,
    opportunityBuildingSystem,
    buildingType: orderBuildingType ?? opportunityBuildingType,
    buildingSystem: orderBuildingSystem ?? opportunityBuildingSystem,
    buildingSize: buildBuildingSize(orderRecord),
    description: buildBuildingDescription(orderRecord, opportunityRecord),
  };
}

async function fetchSalesforceRecord(
  env: ReviewAgentEnv,
  path: string,
  params: Record<string, string>,
): Promise<SalesforceRecord> {
  const baseUrl = requireEnv(env.CLOUDRUN_SALESFORCE_API_URL, "CLOUDRUN_SALESFORCE_API_URL");
  const apiKey = requireEnv(env.CLOUDRUN_SALESFORCE_API_KEY, "CLOUDRUN_SALESFORCE_API_KEY");
  const url = new URL(path, baseUrl);

  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }

  const logger = createLogger({
    minLevel: env.ENVIRONMENT === "production" ? "info" : "debug",
    context: {
      provider: "salesforce-api",
      action: "fetch-record",
      path,
      orderId: params.order_id,
      opportunityId: params.opportunity_id,
    },
  });

  logger.info("Fetching Salesforce record");

  const response = await fetch(url.toString(), {
    method: "GET",
    headers: {
      accept: "application/json",
      "x-api-key": apiKey,
    },
  });
  const body = await readJsonResponse<SalesforceApiResponse>(response);

  if (!response.ok || !body.success) {
    logger.error("Salesforce API fetch failed", {
      status: response.status,
      error: body.error?.message,
    });
    throw new Error(body.error?.message ?? `Salesforce API request failed with ${response.status}.`);
  }

  if (!body.data?.record) {
    logger.error("Salesforce API response missing record", { status: response.status });
    throw new Error("Salesforce API response did not include a record.");
  }

  logger.info("Salesforce record fetched", { status: response.status });

  return body.data.record;
}

function buildCustomerName(opportunityRecord: SalesforceRecord): string | undefined {
  const firstName = readString(opportunityRecord, "new_firstname__c");
  const lastName = readString(opportunityRecord, "new_lastname__c");
  const fullName = firstString([joinName(firstName, lastName), readString(opportunityRecord, "Name")]);

  return fullName?.replace(/[-\s]+$/u, "").trim() || undefined;
}

function buildBuildingDescription(
  orderRecord: SalesforceRecord,
  opportunityRecord: SalesforceRecord,
): string | undefined {
  return firstString([
    joinText([
      readString(orderRecord, "Building_Type__c"),
      readString(orderRecord, "Building_System__c"),
    ]),
    joinText([
      readString(opportunityRecord, "Building_Type__c"),
      readString(opportunityRecord, "Building_System__c"),
    ]),
  ]);
}

function buildBuildingSize(orderRecord: SalesforceRecord): string | undefined {
  const width = formatDimensionForRetell(readString(orderRecord, "new_widthtxt__c"));
  const length = formatDimensionForRetell(readString(orderRecord, "new_lengthtxt__c"));

  if (!width || !length) {
    return undefined;
  }

  return `${width} by ${length} building`;
}

function formatDimensionForRetell(value: string | undefined): string | undefined {
  if (!value) {
    return undefined;
  }

  const numberValue = Number(value);
  if (!Number.isFinite(numberValue) || numberValue <= 0) {
    return value;
  }

  if (Number.isInteger(numberValue)) {
    return String(numberValue);
  }

  return String(numberValue);
}

function toReviewOrderSummary(record: SalesforceRecord): SalesforceReviewOrderSummary {
  return {
    orderId: readString(record, "Id") ?? "",
    orderNumber: readString(record, "OrderNumber"),
    createdDate: readString(record, "CreatedDate"),
    opportunityId: readString(record, "OpportunityId"),
    opportunityName: readRelationshipString(record, "Opportunity", "Name"),
    accountId: readString(record, "AccountId"),
    customerId: readString(record, "Primary_Contact__c"),
    customerEmail: readString(record, "Primary_Contact_Email__c"),
    customerPhone: firstPhone([
      readString(record, "Primary_Contact_Phone__c"),
      readString(record, "Primary_Contact_Mobile__c"),
    ]),
    buildingType: readString(record, "Building_Type__c"),
    buildingSystem: readString(record, "Building_System__c"),
    buildingSize: buildBuildingSize(record),
    salesRepName: readRelationshipString(record, "salesmanid__r", "Name"),
    deliveryCoordinatorName: readRelationshipString(record, "new_deliverycoordinatorid__r", "Name"),
    projectCoordinatorName: readRelationshipString(record, "new_projectcoordinatorid__r", "Name"),
    buildingDescription: joinText([
      readString(record, "Building_Type__c"),
      readString(record, "Building_System__c"),
    ]),
  };
}

function firstPhone(values: Array<string | undefined>): string | undefined {
  for (const value of values) {
    const normalized = normalizePhoneForRetell(value);
    if (normalized) {
      return normalized;
    }
  }

  return undefined;
}

function normalizePhoneForRetell(value: string | undefined): string | undefined {
  if (!value) {
    return undefined;
  }

  if (value.trim().startsWith("+")) {
    return value.trim();
  }

  const digits = value.replace(/\D/gu, "");
  if (digits.length === 10) {
    return `+1${digits}`;
  }

  if (digits.length === 11 && digits.startsWith("1")) {
    return `+${digits}`;
  }

  return undefined;
}

function firstString(values: Array<string | undefined>): string | undefined {
  for (const value of values) {
    if (value?.trim()) {
      return value.trim();
    }
  }

  return undefined;
}

function joinName(firstName: string | undefined, lastName: string | undefined): string | undefined {
  return joinText([firstName, lastName], " ");
}

function joinText(values: Array<string | undefined>, separator = ", "): string | undefined {
  const parts = values.filter((value): value is string => Boolean(value?.trim()));
  if (parts.length === 0) {
    return undefined;
  }

  return parts.join(separator);
}

function readString(record: SalesforceRecord, fieldName: string): string | undefined {
  const value = record[fieldName];
  if (typeof value === "string" && value.trim()) {
    return value.trim();
  }

  if (typeof value === "number") {
    return String(value);
  }

  return undefined;
}

function readRelationshipString(
  record: SalesforceRecord,
  relationshipName: string,
  fieldName: string,
): string | undefined {
  const relationship = record[relationshipName];
  if (!relationship || typeof relationship !== "object" || Array.isArray(relationship)) {
    return undefined;
  }

  return readString(relationship as SalesforceRecord, fieldName);
}

async function readJsonResponse<T>(response: Response): Promise<T> {
  const text = await response.text();
  if (!text) {
    return {} as T;
  }

  return JSON.parse(text) as T;
}

function requireEnv(value: string | undefined, name: string): string {
  if (value) {
    return value;
  }

  throw new Error(`Missing required environment variable: ${name}.`);
}
