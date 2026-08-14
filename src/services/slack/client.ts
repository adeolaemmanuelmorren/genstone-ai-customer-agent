import type { CallbackScheduleInput } from "../../schemas/retell-tools";
import type { CustomerAgentEnv } from "../../types/env";
import { isRecord, readJson, readString } from "../providers/provider-utils";
import { fetchProvider } from "../providers/provider-fetch";

const SLACK_API_URL = "https://slack.com/api";
const TRAVIS_SLACK_USER_ID = "U01ACN50K8U";

type SlackApiResult = {
  ok?: boolean;
  channel?: {
    id?: string;
  };
};

export async function notifyCallbackSchedulingFailure(
  env: CustomerAgentEnv,
  input: CallbackScheduleInput,
): Promise<boolean> {
  const botToken = env.SLACK_BOT_TOKEN?.trim();
  if (!botToken) {
    return false;
  }

  try {
    const conversation = await callSlack(botToken, "conversations.open", {
      users: TRAVIS_SLACK_USER_ID,
    });
    const channelId = readSlackChannelId(conversation);
    if (!channelId) {
      return false;
    }

    const result = await callSlack(botToken, "chat.postMessage", {
      channel: channelId,
      text: buildCallbackFailureMessage(input),
      unfurl_links: false,
      unfurl_media: false,
    });

    return result.ok === true;
  } catch {
    return false;
  }
}

async function callSlack(
  botToken: string,
  method: string,
  body: Record<string, unknown>,
): Promise<SlackApiResult> {
  const response = await fetchProvider(`${SLACK_API_URL}/${method}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${botToken}`,
      "Content-Type": "application/json; charset=utf-8",
    },
    body: JSON.stringify(body),
  });
  const result = await readJson(response);

  if (!response.ok || !isRecord(result) || result.ok !== true) {
    throw new Error("Slack rejected the callback failure notification.");
  }

  return result as SlackApiResult;
}

function readSlackChannelId(result: SlackApiResult): string | undefined {
  if (!isRecord(result.channel)) {
    return undefined;
  }

  return readString(result.channel.id);
}

function buildCallbackFailureMessage(input: CallbackScheduleInput): string {
  return [
    ":rotating_light: GenStone callback scheduling failed",
    `Caller: ${input.customer_name}`,
    `Phone: ${input.callback_phone}`,
    `Email: ${input.customer_email}`,
    `Requested: ${input.callback_date} at ${input.callback_time} Mountain`,
    `Subject: ${input.callback_subject}`,
    `Summary: ${input.callback_summary}`,
    `Call: ${input.call_id}`,
  ].join("\n");
}
