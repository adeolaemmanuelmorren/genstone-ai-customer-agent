import type { CustomerAgentEnv } from "../../types/env";
import { isRecord, readJson, readString, requireConfiguration } from "../providers/provider-utils";
import { fetchProvider } from "../providers/provider-fetch";

const ZENDESK_BASE_URL = "https://genstone.zendesk.com/api/v2";
const SUPPORT_GROUP_ID = 26_273_508;
const GENSTONE_BRAND_ID = 466_088;
const GENSTONE_TICKET_FORM_ID = 13_148_185_979_027;
const CUSTOMER_NAME_FIELD_ID = 27_432_028;
const PHONE_FIELD_ID = 81_047_148;
const CALLER_TYPE_FIELD_ID = 360_025_854_713;
const COUNTRY_FIELD_ID = 360_026_226_033;
const TICKET_TYPE_FIELD_ID = 360_026_303_754;

const ANSWERING_SERVICE_TICKET_TYPE = "answering_service";
const ANSWER_CONNECT_TAG = "answer_connect";

type ZendeskCallerType =
  | "customer"
  | "contractor"
  | "distributor"
  | "retail_partner"
  | "other";

type ZendeskCountry = "united_states" | "canada" | "other_country";

interface ZendeskTicketMetadata {
  customerName: string;
  customerEmail: string;
  phone: string;
  callerType: ZendeskCallerType;
  country?: ZendeskCountry;
}

export interface ZendeskCase {
  id: string;
  status: string;
  subject: string;
  description?: string;
}

export async function createZendeskCase(
  env: CustomerAgentEnv,
  input: {
    subject: string;
    privateComment: string;
    metadata: ZendeskTicketMetadata;
  },
): Promise<ZendeskCase> {
  const response = await zendeskFetch(env, new URL(`${ZENDESK_BASE_URL}/tickets.json`), {
    method: "POST",
    body: JSON.stringify({
      ticket: {
        subject: input.subject,
        comment: { body: input.privateComment, public: false },
        requester: {
          name: input.metadata.customerName,
          email: input.metadata.customerEmail,
        },
        group_id: SUPPORT_GROUP_ID,
        brand_id: GENSTONE_BRAND_ID,
        ticket_form_id: GENSTONE_TICKET_FORM_ID,
        type: "question",
        priority: "normal",
        status: "new",
        tags: buildTicketTags(input.metadata),
        custom_fields: buildCustomFields(input.metadata),
      },
    }),
  });
  return readTicketResponse(response, "create");
}

export async function getZendeskCase(
  env: CustomerAgentEnv,
  ticketId: string,
): Promise<ZendeskCase> {
  const url = new URL(`${ZENDESK_BASE_URL}/tickets/${encodeURIComponent(ticketId)}.json`);
  const response = await zendeskFetch(env, url);
  return readTicketResponse(response, "read");
}

export async function appendPrivateZendeskComment(
  env: CustomerAgentEnv,
  input: {
    ticketId: string;
    privateComment: string;
  },
): Promise<ZendeskCase> {
  const url = new URL(
    `${ZENDESK_BASE_URL}/tickets/${encodeURIComponent(input.ticketId)}.json`,
  );
  const response = await zendeskFetch(env, url, {
    method: "PUT",
    body: JSON.stringify({
      ticket: {
        comment: {
          body: input.privateComment,
          public: false,
        },
      },
    }),
  });

  return readTicketResponse(response, "update");
}

function buildTicketTags(metadata: ZendeskTicketMetadata): string[] {
  return [
    ANSWER_CONNECT_TAG,
    ANSWERING_SERVICE_TICKET_TYPE,
    metadata.callerType,
  ];
}

function buildCustomFields(
  metadata: ZendeskTicketMetadata,
): Array<{ id: number; value: string }> {
  const fields = [
    { id: CUSTOMER_NAME_FIELD_ID, value: metadata.customerName },
    { id: PHONE_FIELD_ID, value: metadata.phone },
    { id: CALLER_TYPE_FIELD_ID, value: metadata.callerType },
    { id: TICKET_TYPE_FIELD_ID, value: ANSWERING_SERVICE_TICKET_TYPE },
  ];

  if (metadata.country) {
    fields.push({ id: COUNTRY_FIELD_ID, value: metadata.country });
  }

  return fields;
}

async function readTicketResponse(response: Response, action: string): Promise<ZendeskCase> {
  const body = await readJson(response);
  if (!response.ok) {
    throw new Error(`Zendesk ${action} failed with ${response.status}.`);
  }

  const ticket = isRecord(body) && isRecord(body.ticket) ? body.ticket : undefined;
  const parsed = ticket ? parseZendeskCase(ticket)[0] : undefined;
  if (!parsed) {
    throw new Error(`Zendesk ${action} returned an invalid response.`);
  }

  return parsed;
}

function parseZendeskCase(value: unknown): ZendeskCase[] {
  if (!isRecord(value)) {
    return [];
  }
  const id = typeof value.id === "number" ? String(value.id) : readString(value.id);
  const subject = readString(value.subject);
  const status = readString(value.status);
  if (!id || !subject || !status) {
    return [];
  }
  return [{ id, subject, status, description: readString(value.description) }];
}

function zendeskFetch(
  env: CustomerAgentEnv,
  url: URL,
  init: RequestInit = {},
): Promise<Response> {
  const email = requireConfiguration(
    env.ZENDESK_GENSTONE_API_EMAIL,
    "ZENDESK_GENSTONE_API_EMAIL",
  );
  const token = requireConfiguration(
    env.ZENDESK_GESNTONE_API_TOKEN,
    "ZENDESK_GESNTONE_API_TOKEN",
  );
  return fetchProvider(url, {
    ...init,
    headers: {
      Authorization: `Basic ${btoa(`${email}/token:${token}`)}`,
      "Content-Type": "application/json",
      ...init.headers,
    },
  });
}
