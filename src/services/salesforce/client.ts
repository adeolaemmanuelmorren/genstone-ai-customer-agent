import type { CustomerAgentEnv } from "../../types/env";
import {
  isRecord,
  readJson,
  readString,
  requireConfiguration,
} from "../providers/provider-utils";
import { fetchProvider } from "../providers/provider-fetch";

export interface SalesforceContact {
  id: string;
  name?: string;
  phone?: string;
  email?: string;
}

export interface SalesforceEmployee {
  id: string;
  name: string;
  phone?: string;
}

export class SalesforceLookupError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

export async function lookupSalesforceContact(
  env: CustomerAgentEnv,
  input: { phone?: string; email?: string },
): Promise<SalesforceContact> {
  if (input.phone && input.email) {
    try {
      return await lookupSalesforceContactByOneIdentifier(env, {
        phone: input.phone,
      });
    } catch (error) {
      if (!(error instanceof SalesforceLookupError) || error.status !== 404) {
        throw error;
      }

      return lookupSalesforceContactByOneIdentifier(env, {
        email: input.email,
      });
    }
  }

  return lookupSalesforceContactByOneIdentifier(env, input);
}

async function lookupSalesforceContactByOneIdentifier(
  env: CustomerAgentEnv,
  input: { phone?: string; email?: string },
): Promise<SalesforceContact> {
  const url = new URL("/v1/contacts", getBaseUrl(env));
  if (input.phone) {
    url.searchParams.set("phone", input.phone);
  }
  if (input.email) {
    url.searchParams.set("email", input.email);
  }

  const response = await salesforceGet(env, url);
  if (!response.ok) {
    throw new SalesforceLookupError("Salesforce contact lookup failed.", response.status);
  }

  const body = await readJson(response);
  const data = isRecord(body) && isRecord(body.data) ? body.data : undefined;
  const record = data && isRecord(data.record) ? data.record : undefined;
  const id = readString(record?.Id);
  if (!id) {
    throw new SalesforceLookupError("Salesforce contact response was invalid.", 502);
  }

  const firstName = readString(record?.FirstName);
  const lastName = readString(record?.LastName);

  return {
    id,
    name: [firstName, lastName].filter(Boolean).join(" ") || undefined,
    phone: readString(record?.Phone) ?? readString(record?.MobilePhone),
    email: readString(record?.Email),
  };
}

export async function lookupActiveEmployees(
  env: CustomerAgentEnv,
  employeeName: string,
): Promise<SalesforceEmployee[]> {
  const url = new URL("/v1/users", getBaseUrl(env));
  url.searchParams.set("q", employeeName);
  url.searchParams.set("limit", "20");

  const response = await salesforceGet(env, url);
  if (!response.ok) {
    throw new SalesforceLookupError("Salesforce employee lookup failed.", response.status);
  }

  const body = await readJson(response);
  const data = isRecord(body) && isRecord(body.data) ? body.data : undefined;
  const users = data && Array.isArray(data.users) ? data.users : [];

  return users.flatMap((value) => {
    if (!isRecord(value)) {
      return [];
    }

    const id = readString(value.id);
    const name = readString(value.name);
    if (!id || !name) {
      return [];
    }

    return [{ id, name, phone: readString(value.phone) }];
  });
}

function getBaseUrl(env: CustomerAgentEnv): string {
  return requireConfiguration(
    env.CLOUDRUN_SALESFORCE_API_URL,
    "CLOUDRUN_SALESFORCE_API_URL",
  );
}

async function salesforceGet(
  env: CustomerAgentEnv,
  url: URL,
): Promise<Response> {
  const apiKey = requireConfiguration(
    env.CLOUDRUN_SALESFORCE_API_KEY,
    "CLOUDRUN_SALESFORCE_API_KEY",
  );
  return fetchProvider(url, { headers: { "x-api-key": apiKey } });
}
