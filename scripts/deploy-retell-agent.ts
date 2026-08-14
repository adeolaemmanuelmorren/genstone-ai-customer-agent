import Retell from "retell-sdk";
import type {
  AgentResponse,
} from "retell-sdk/resources/agent";
import type {
  ConversationFlowComponentResponse,
} from "retell-sdk/resources/conversation-flow-component";
import type { ConversationFlowResponse } from "retell-sdk/resources/conversation-flow";

import {
  buildAgentConfig,
  buildConversationFlowConfig,
  buildSharedComponentConfigs,
  RETELL_BUILD_CONSTANTS,
  type RetellComponentBuild,
  type RetellComponentIds,
} from "../retell/build-config.js";
import { assertExpectedConfig } from "./retell-config-readback.js";

const AGENT_BASE_NAME =
  process.env.RETELL_AGENT_NAME?.trim() || "GenStone Customer Agent";
const AGENT_NAME = `${AGENT_BASE_NAME} — ${RETELL_BUILD_CONSTANTS.sharedComponentRelease}`;
const AGENT_ID = process.env.RETELL_AGENT_ID?.trim()
  || "agent_4863348a135c633285041a504b";
const LIST_PAGE_SIZE = 100;

function requireEnvironmentVariable(name: string): string {
  const value = process.env[name]?.trim();

  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
}

async function findEditableAgent(client: Retell): Promise<{
  agent: AgentResponse;
  createdDraft: boolean;
  baseVersion: number | null;
}> {
  const latestAgent = await client.agent.retrieve(AGENT_ID);

  if (!latestAgent.is_published) {
    return {
      agent: latestAgent,
      createdDraft: false,
      baseVersion: latestAgent.base_version ?? null,
    };
  }

  const newVersion = await client.agent.createVersion(AGENT_ID, {
    base_version: latestAgent.version,
  });
  const draftAgent = await client.agent.retrieve(AGENT_ID, {
    version: newVersion.version,
  });

  if (draftAgent.is_published) {
    throw new Error(
      `Retell agent version ${draftAgent.version} was expected to be an editable draft.`,
    );
  }

  return {
    agent: draftAgent,
    createdDraft: true,
    baseVersion: latestAgent.version,
  };
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
  builds: RetellComponentBuild[],
): Promise<{
  ids: RetellComponentIds;
  statuses: Array<{ name: string; id: string; status: "created" | "reused" }>;
}> {
  const existingComponents = await listSharedComponents(client);
  const ids = {} as RetellComponentIds;
  const statuses: Array<{ name: string; id: string; status: "created" | "reused" }> = [];

  for (const build of builds) {
    const matches = existingComponents.filter(
      (component) => component.name === build.config.name,
    );

    if (matches.length > 1) {
      throw new Error(`Multiple Retell components are named ${build.config.name}.`);
    }

    const existing = matches[0];
    if (existing) {
      const retrieved = await client.conversationFlowComponent.retrieve(
        existing.conversation_flow_component_id,
      );
      assertExpectedConfig(build.config, retrieved, `Retell component ${build.config.name}`);
      ids[build.componentName] = retrieved.conversation_flow_component_id;
      statuses.push({ name: retrieved.name, id: retrieved.conversation_flow_component_id, status: "reused" });
      continue;
    }

    const created = await client.conversationFlowComponent.create(build.config);
    assertExpectedConfig(build.config, created, `Retell component ${build.config.name}`);
    ids[build.componentName] = created.conversation_flow_component_id;
    statuses.push({ name: created.name, id: created.conversation_flow_component_id, status: "created" });
  }

  return { ids, statuses };
}

function validateExistingFlow(
  flow: ConversationFlowResponse,
  componentIds: RetellComponentIds,
): void {
  const expected = buildConversationFlowConfig({ componentIds });
  assertExpectedConfig(expected, flow, "Retell conversation flow");
}

async function updateAgentDraftFlow(
  client: Retell,
  agent: AgentResponse,
  componentIds: RetellComponentIds,
): Promise<ConversationFlowResponse> {
  if (agent.response_engine.type !== "conversation-flow") {
    throw new Error(`Agent ${agent.agent_id} does not use a Retell conversation flow.`);
  }

  const flowVersion = agent.response_engine.version;

  if (flowVersion !== agent.version) {
    throw new Error(
      `Agent draft version ${agent.version} does not match its flow version ${flowVersion}.`,
    );
  }

  const updated = await client.conversationFlow.update(
    agent.response_engine.conversation_flow_id,
    {
      ...buildConversationFlowConfig({ componentIds }),
      version: flowVersion,
    },
  );

  validateExistingFlow(updated, componentIds);
  return updated;
}

async function main() {
  const retellApiKey = requireEnvironmentVariable("RETELL_API_KEY_GENSTONE");
  const workerApiKey = requireEnvironmentVariable(
    "GENSTONE_AI_CUSTOMER_AGENT_WORKER_API_KEY",
  );

  const client = new Retell({ apiKey: retellApiKey });
  const editableAgent = await findEditableAgent(client);

  const sharedComponents = await resolveSharedComponents(
    client,
    buildSharedComponentConfigs({ workerApiKey }),
  );
  const conversationFlow = await updateAgentDraftFlow(
    client,
    editableAgent.agent,
    sharedComponents.ids,
  );

  let agent: AgentResponse;

  try {
    const agentConfig = buildAgentConfig(
      conversationFlow.conversation_flow_id,
      conversationFlow.version,
      AGENT_NAME,
    );

    agent = await client.agent.update(editableAgent.agent.agent_id, {
      ...agentConfig,
      version: editableAgent.agent.version,
    });
  } catch (error) {
    console.error(
      `The Retell flow is available as ${conversationFlow.conversation_flow_id}, but the agent draft could not be updated.`,
    );
    throw error;
  }

  try {
    const verifiedAgent = await client.agent.retrieve(agent.agent_id, {
      version: agent.version,
    });
    const verifiedFlow = await client.conversationFlow.retrieve(
      conversationFlow.conversation_flow_id,
      { version: conversationFlow.version },
    );

    validateExistingFlow(verifiedFlow, sharedComponents.ids);
    assertExpectedConfig(
      buildAgentConfig(
        verifiedFlow.conversation_flow_id,
        verifiedFlow.version,
        AGENT_NAME,
      ),
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
          agent_status: "updated",
          agent_version: verifiedAgent.version,
          base_version: editableAgent.baseVersion,
          draft_created: editableAgent.createdDraft,
          conversation_flow_id: verifiedFlow.conversation_flow_id,
          conversation_flow_version: verifiedFlow.version,
          conversation_flow_status: "updated_in_place",
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
