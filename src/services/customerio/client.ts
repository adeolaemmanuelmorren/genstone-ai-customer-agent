import type { CustomerAgentEnv } from "../../types/env";
import { isRecord, readJson, readString, requireConfiguration } from "../providers/provider-utils";
import { fetchProvider } from "../providers/provider-fetch";

const CUSTOMERIO_SEND_URL = "https://api.customer.io/v1/send/email";

export async function sendCustomerIoEmail(
  env: CustomerAgentEnv,
  input: {
    transactionalMessageId: number;
    recipient: string;
    messageData: Record<string, unknown>;
  },
): Promise<string> {
  const apiKey = requireConfiguration(
    env.CUSTOMERIO_APP_API_KEY,
    "CUSTOMERIO_APP_API_KEY",
  );
  const response = await fetchProvider(CUSTOMERIO_SEND_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      transactional_message_id: input.transactionalMessageId,
      identifiers: { email: input.recipient },
      to: input.recipient,
      message_data: input.messageData,
    }),
  }, 6_000);
  const body = await readJson(response);

  if (!response.ok) {
    throw new Error(`Customer.io send failed with ${response.status}.`);
  }

  const deliveryId = isRecord(body) ? readString(body.delivery_id) : undefined;
  if (!deliveryId) {
    throw new Error("Customer.io accepted the request without a delivery ID.");
  }

  return deliveryId;
}
