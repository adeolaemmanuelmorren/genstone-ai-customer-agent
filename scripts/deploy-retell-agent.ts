import Retell from "retell-sdk";
import type {
  AgentResponse,
} from "retell-sdk/resources/agent";
import type {
  ConversationFlowComponentResponse,
} from "retell-sdk/resources/conversation-flow-component";
import type {
  ConversationFlowResponse,
} from "retell-sdk/resources/conversation-flow";

import {
  buildAgentConfig,
  buildConversationFlowConfig,
  buildSharedComponentConfigs,
  RETELL_BUILD_CONSTANTS,
  type RetellSharedComponentBuild,
  type RetellSharedComponentIds,
} from "../retell/build-config.js";
import { assertExpectedConfig } from "./retell-config-readback.js";

const AGENT_NAME = "GenStone Customer Agent";
const LIST_PAGE_SIZE = 100;

function requireEnvironmentVariable(name: string): string {
  const value = process.env[name]?.trim();

  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
}

function validateExistingSharedComponent(
  build: RetellSharedComponentBuild,
  existing: ConversationFlowComponentResponse,
): void {
  assertExpectedConfig(build.config, existing, `Retell component ${build.config.name}`);
}

async function listSharedComponents(
  client: Retell,
): Promise<ConversationFlowComponentResponse[]> {
  const components: ConversationFlowComponentResponse[] = [];
  let paginationKey: string | undefined;

  do {
    const response = await client.conversationFlowComponent.list({
      limit: LIST_PAGE_SIZE,
      pagination_key: paginationKey,
    });

    components.push(...(response.items ?? []));
    paginationKey = response.has_more ? response.pagination_key : undefined;
  } while (paginationKey);

  return components;
}

async function resolveSharedComponents(
  client: Retell,
  builds: RetellSharedComponentBuild[],
): Promise<{
  ids: RetellSharedComponentIds;
  statuses: Array<{ name: string; id: string; status: "created" | "reused" }>;
}> {
  const existingComponents = await listSharedComponents(client);
  const ids = {} as RetellSharedComponentIds;
  const statuses: Array<{
    name: string;
    id: string;
    status: "created" | "reused";
  }> = [];

  for (const build of builds) {
    const matches = existingComponents.filter(
      (component) => component.name === build.config.name,
    );

    if (matches.length > 1) {
      throw new Error(
        `Multiple Retell shared subflows are named ${build.config.name}. Refusing to choose one.`,
      );
    }

    const existing = matches[0];

    if (existing) {
      const retrieved = await client.conversationFlowComponent.retrieve(
        existing.conversation_flow_component_id,
      );
      validateExistingSharedComponent(build, retrieved);
      ids[build.componentName] = retrieved.conversation_flow_component_id;
      statuses.push({
        name: retrieved.name,
        id: retrieved.conversation_flow_component_id,
        status: "reused",
      });
      continue;
    }

    const created = await client.conversationFlowComponent.create(build.config);
    validateExistingSharedComponent(build, created);
    ids[build.componentName] = created.conversation_flow_component_id;
    statuses.push({
      name: created.name,
      id: created.conversation_flow_component_id,
      status: "created",
    });
  }

  return { ids, statuses };
}

async function findExistingAgent(client: Retell) {
  let paginationKey: string | undefined;

  do {
    const response = await client.agent.list({
      limit: LIST_PAGE_SIZE,
      pagination_key: paginationKey,
    });
    const match = response.items?.find((agent) => agent.agent_name === AGENT_NAME);
    if (match) {
      return match;
    }
    paginationKey = response.has_more ? response.pagination_key : undefined;
  } while (paginationKey);

  return undefined;
}

async function listConversationFlows(
  client: Retell,
): Promise<ConversationFlowResponse[]> {
  const flows: ConversationFlowResponse[] = [];
  let paginationKey: string | undefined;

  do {
    const response = await client.conversationFlow.list({
      limit: LIST_PAGE_SIZE,
      pagination_key: paginationKey,
    });

    flows.push(...(response.items ?? []));
    paginationKey = response.has_more ? response.pagination_key : undefined;
  } while (paginationKey);

  return flows;
}

function hasFlowReleaseMarker(flow: ConversationFlowResponse): boolean {
  return (flow.notes ?? []).some(
    (note) => note.id === RETELL_BUILD_CONSTANTS.flowRelease,
  );
}

function validateExistingFlow(
  flow: ConversationFlowResponse,
  sharedComponentIds: RetellSharedComponentIds,
): void {
  const expected = buildConversationFlowConfig({ sharedComponentIds });
  assertExpectedConfig(expected, flow, "Retell conversation flow");
}

async function resolveConversationFlow(
  client: Retell,
  sharedComponentIds: RetellSharedComponentIds,
): Promise<{ flow: ConversationFlowResponse; status: "created" | "reused" }> {
  const flows = await listConversationFlows(client);
  const matches = flows.filter(hasFlowReleaseMarker);

  if (matches.length > 1) {
    throw new Error(
      `Multiple Retell flows use release marker ${RETELL_BUILD_CONSTANTS.flowRelease}. Refusing to choose one.`,
    );
  }

  const existing = matches[0];

  if (existing) {
    const retrieved = await client.conversationFlow.retrieve(
      existing.conversation_flow_id,
      { version: existing.version },
    );
    validateExistingFlow(retrieved, sharedComponentIds);
    return { flow: retrieved, status: "reused" };
  }

  const created = await client.conversationFlow.create(
    buildConversationFlowConfig({ sharedComponentIds }),
  );
  validateExistingFlow(created, sharedComponentIds);
  return { flow: created, status: "created" };
}

async function main() {
  const retellApiKey = requireEnvironmentVariable("RETELL_API_KEY_GENSTONE");
  const workerApiKey = requireEnvironmentVariable(
    "GENSTONE_AI_CUSTOMER_AGENT_WORKER_API_KEY",
  );

  const client = new Retell({ apiKey: retellApiKey });
  const existingAgent = await findExistingAgent(client);

  const sharedComponents = await resolveSharedComponents(
    client,
    buildSharedComponentConfigs({ workerApiKey }),
  );
  const conversationFlow = await resolveConversationFlow(
    client,
    sharedComponents.ids,
  );

  let agent: AgentResponse;
  let agentStatus: "created" | "updated";

  try {
    const agentConfig = buildAgentConfig(
      conversationFlow.flow.conversation_flow_id,
      conversationFlow.flow.version,
    );

    if (existingAgent) {
      agent = await client.agent.update(existingAgent.agent_id, agentConfig);
      agentStatus = "updated";
    } else {
      agent = await client.agent.create(agentConfig);
      agentStatus = "created";
    }
  } catch (error) {
    console.error(
      `The Retell flow is available as ${conversationFlow.flow.conversation_flow_id}, but the agent draft could not be created or updated.`,
    );
    throw error;
  }

  try {
    const verifiedAgent = await client.agent.retrieve(agent.agent_id);
    const verifiedFlow = await client.conversationFlow.retrieve(
      conversationFlow.flow.conversation_flow_id,
      { version: conversationFlow.flow.version },
    );

    validateExistingFlow(verifiedFlow, sharedComponents.ids);
    assertExpectedConfig(
      buildAgentConfig(verifiedFlow.conversation_flow_id, verifiedFlow.version),
      verifiedAgent,
      "Retell agent",
    );

    const phoneNumbers = await client.phoneNumber.list({ limit: LIST_PAGE_SIZE });
    const phoneNumberBound = (phoneNumbers.items ?? []).some((phoneNumber) =>
      [...(phoneNumber.inbound_agents ?? []), ...(phoneNumber.outbound_agents ?? [])]
        .some((binding) => binding.agent_id === verifiedAgent.agent_id),
    );

    console.log(
      JSON.stringify(
        {
          agent_id: verifiedAgent.agent_id,
          agent_name: verifiedAgent.agent_name,
          agent_status: agentStatus,
          conversation_flow_id: verifiedFlow.conversation_flow_id,
          conversation_flow_version: verifiedFlow.version,
          conversation_flow_status: conversationFlow.status,
          shared_components: sharedComponents.statuses,
          knowledge_base_id: RETELL_BUILD_CONSTANTS.knowledgeBaseId,
          published: verifiedAgent.is_published ?? false,
          phone_number_bound: phoneNumberBound,
          verified_by_readback: true,
        },
        null,
        2,
      ),
    );
  } catch (error) {
    console.error(
      `The Retell agent draft is ${agent.agent_id}, but read-back verification failed. Inspect that agent id through the API before rerunning.`,
    );
    throw error;
  }
}

await main();
