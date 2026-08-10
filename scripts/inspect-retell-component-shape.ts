import Retell from "retell-sdk";

type UnknownRecord = Record<string, unknown>;

function requireEnvironmentVariable(name: string): string {
  const value = process.env[name]?.trim();

  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
}

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readString(value: unknown): string | undefined {
  return typeof value === "string" && value ? value : undefined;
}

async function main() {
  const client = new Retell({
    apiKey: requireEnvironmentVariable("RETELL_API_KEY_GENSTONE"),
  });
  const listed = await client.conversationFlow.list({ limit: 100 });
  const flows = [];

  for (const item of listed.items ?? []) {
    const flow = await client.conversationFlow.retrieve(
      item.conversation_flow_id,
      { version: item.version },
    );
    const localComponents = (flow.components ?? []).map((component) => {
      const record = component as unknown as UnknownRecord;

      return {
        name: component.name,
        returned_identifier_fields: Object.fromEntries(
          Object.entries(record).filter(([key, value]) =>
            key.toLowerCase().includes("id") && typeof value === "string"
          ),
        ),
      };
    });
    const componentNodes = flow.nodes.flatMap((node) => {
      if (!isRecord(node) || node.type !== "component") {
        return [];
      }

      return [{
        name: readString(node.name),
        component_id: readString(node.component_id),
        component_type: readString(node.component_type),
      }];
    });

    flows.push({
      conversation_flow_id: flow.conversation_flow_id,
      version: flow.version,
      local_components: localComponents,
      component_nodes: componentNodes,
    });
  }

  console.log(JSON.stringify({ flows }, null, 2));
}

await main();
