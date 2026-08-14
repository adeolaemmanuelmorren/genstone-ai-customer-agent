import Retell from "retell-sdk";

function requireEnvironmentVariable(name: string): string {
  const value = process.env[name]?.trim();

  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
}

async function main() {
  const client = new Retell({
    apiKey: requireEnvironmentVariable("RETELL_API_KEY_GENSTONE"),
  });
  const requestedCallIds = process.argv.slice(2);
  const callIds = requestedCallIds.length > 0
    ? requestedCallIds
    : (await client.call.list({ limit: 1, sort_order: "descending" })).items.map(
        (call) => call.call_id,
      );

  for (const callId of callIds) {
    const call = await client.call.retrieve(callId);

    console.log(JSON.stringify({
      call_id: call.call_id,
      start_timestamp: call.start_timestamp,
      end_timestamp: call.end_timestamp,
      disconnection_reason: call.disconnection_reason,
      transcript_with_tool_calls: call.transcript_with_tool_calls?.map((record) => {
        const { words: _words, ...summary } = record;
        return summary;
      }),
      latency: call.latency,
    }, null, 2));
  }
}

void main();
