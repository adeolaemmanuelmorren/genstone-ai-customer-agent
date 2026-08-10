import type { CustomerAgentEnv } from "../../types/env";
import { requireConfiguration } from "../providers/provider-utils";
import { fetchProvider } from "../providers/provider-fetch";

const FIVE9_URL = "https://api.five9.com/wsadmin/v12/AdminWebService";

export async function suppressFive9Number(
  env: CustomerAgentEnv,
  phone: string,
): Promise<"suppressed" | "already_suppressed"> {
  const username = requireConfiguration(
    env.FIVE9_USERNAME,
    "FIVE9_USERNAME",
  );
  const password = requireConfiguration(
    env.FIVE9_PASSWORD,
    "FIVE9_PASSWORD",
  );
  const digits = phone.replace(/\D/g, "");
  const response = await fetchProvider(FIVE9_URL, {
    method: "POST",
    headers: {
      Authorization: `Basic ${btoa(`${username}:${password}`)}`,
      "Content-Type": "text/xml;charset=UTF-8",
    },
    body: buildDncEnvelope(digits),
  });
  const body = await response.text();
  const normalized = body.toLowerCase();

  if (!response.ok || normalized.includes("<soap:fault") || normalized.includes("<faultcode")) {
    throw new Error(`Five9 DNC request failed with ${response.status}.`);
  }

  if (normalized.includes("already") || normalized.includes("duplicate")) {
    return "already_suppressed";
  }

  return "suppressed";
}

function buildDncEnvelope(phone: string): string {
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:ser="http://service.admin.ws.five9.com/">',
    "<soapenv:Header/>",
    "<soapenv:Body>",
    "<ser:addNumbersToDnc>",
    `<numbers>${phone}</numbers>`,
    "</ser:addNumbersToDnc>",
    "</soapenv:Body>",
    "</soapenv:Envelope>",
  ].join("");
}
