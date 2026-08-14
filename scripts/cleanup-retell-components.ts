import Retell from "retell-sdk";

import { RETELL_COMPONENT_NAMES } from "../retell/build-config.js";

const PAGE_SIZE = 100;
const GENSTONE_COMPONENT_PREFIX = "GenStone — ";

function requireEnvironmentVariable(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

async function main(): Promise<void> {
  const apply = process.argv.includes("--apply");
  const summaryOnly = process.argv.includes("--summary");
  const client = new Retell({
    apiKey: requireEnvironmentVariable("RETELL_API_KEY_GENSTONE"),
  });
  const retainedNames = new Set<string>(Object.values(RETELL_COMPONENT_NAMES));
  const obsolete = [];
  let paginationKey: string | undefined;

  do {
    const page = await client.conversationFlowComponent.list({
      limit: PAGE_SIZE,
      pagination_key: paginationKey,
    });

    for (const component of page.items ?? []) {
      if (!component.name.startsWith(GENSTONE_COMPONENT_PREFIX)) {
        continue;
      }
      if (retainedNames.has(component.name)) {
        continue;
      }
      obsolete.push(component);
    }

    paginationKey = page.has_more ? page.pagination_key : undefined;
  } while (paginationKey);

  if (apply) {
    for (const component of obsolete) {
      await client.conversationFlowComponent.delete(
        component.conversation_flow_component_id,
      );
    }
  }

  console.log(JSON.stringify({
    mode: apply ? "deleted" : "dry_run",
    obsolete_count: obsolete.length,
    retained_names: [...retainedNames],
    ...(!summaryOnly ? {
      obsolete_components: obsolete.map((component) => ({
        id: component.conversation_flow_component_id,
        name: component.name,
        linked_flow_count: component.linked_conversation_flow_ids?.length ?? 0,
      })),
    } : {}),
  }, null, 2));
}

await main();
