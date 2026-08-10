import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import Retell from "retell-sdk";
import type {
  BatchTestResponse,
  TestCaseDefinitionResponse,
  TestCaseJobResponse,
  TestCreateTestCaseDefinitionParams,
  TestUpdateTestCaseDefinitionParams,
} from "retell-sdk/resources/tests";

import {
  buildRetellSimulationDefinitions,
  RETELL_SIMULATION_TOOL_COUNT,
  type RetellSimulationTarget,
} from "../retell/simulation-suite.js";

const POLL_INTERVAL_MS = 5_000;
const MAX_WAIT_MS = 20 * 60_000;
const REPORT_DIRECTORY = "retell-qa-results";
const AGENT_NAME = "GenStone Customer Agent";

function requireEnvironmentVariable(name: string): string {
  const value = process.env[name]?.trim();

  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
}

function wait(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function assertEveryToolIsMocked(
  definition: TestCreateTestCaseDefinitionParams,
): void {
  const toolNames = new Set(
    (definition.tool_mocks ?? []).map((mock) => mock.tool_name),
  );

  if (toolNames.size === RETELL_SIMULATION_TOOL_COUNT) {
    return;
  }

  throw new Error(
    `${definition.name} does not mock every Retell tool. Refusing to run a simulation that could call a live provider.`,
  );
}

async function listTestCaseDefinitions(
  client: Retell,
  conversationFlowId: string,
): Promise<TestCaseDefinitionResponse[]> {
  const definitions: TestCaseDefinitionResponse[] = [];
  let paginationKey: string | undefined;

  do {
    const response = await client.tests.listTestCaseDefinitions({
      type: "conversation-flow",
      conversation_flow_id: conversationFlowId,
      limit: 100,
      pagination_key: paginationKey,
    });

    definitions.push(...(response.items ?? []));
    paginationKey = response.has_more ? response.pagination_key : undefined;
  } while (paginationKey);

  return definitions;
}

function toUpdateParams(
  definition: TestCreateTestCaseDefinitionParams,
): TestUpdateTestCaseDefinitionParams {
  return {
    name: definition.name,
    response_engine: definition.response_engine,
    user_prompt: definition.user_prompt,
    llm_model: definition.llm_model,
    metrics: definition.metrics,
    dynamic_variables: definition.dynamic_variables,
    tool_mocks: definition.tool_mocks,
  };
}

async function upsertTestCaseDefinitions(
  client: Retell,
  desiredDefinitions: TestCreateTestCaseDefinitionParams[],
  target: RetellSimulationTarget,
): Promise<TestCaseDefinitionResponse[]> {
  const existingDefinitions = await listTestCaseDefinitions(
    client,
    target.conversationFlowId,
  );
  const resolvedDefinitions: TestCaseDefinitionResponse[] = [];

  for (const desired of desiredDefinitions) {
    assertEveryToolIsMocked(desired);

    const matches = existingDefinitions.filter(
      (existing) => existing.name === desired.name,
    );

    if (matches.length > 1) {
      throw new Error(
        `Multiple Retell test definitions are named ${desired.name}. Refusing to choose one.`,
      );
    }

    const existing = matches[0];

    if (!existing) {
      resolvedDefinitions.push(
        await client.tests.createTestCaseDefinition(desired),
      );
      continue;
    }

    resolvedDefinitions.push(
      await client.tests.updateTestCaseDefinition(
        existing.test_case_definition_id,
        toUpdateParams(desired),
      ),
    );
  }

  return resolvedDefinitions;
}

async function resolveSimulationTarget(
  client: Retell,
): Promise<RetellSimulationTarget> {
  const response = await client.agent.list({ limit: 100 });
  const listedAgent = response.items?.find(
    (candidate) => candidate.agent_name === AGENT_NAME,
  );

  if (!listedAgent) {
    throw new Error(`Retell agent ${AGENT_NAME} was not found.`);
  }

  const agent = await client.agent.retrieve(listedAgent.agent_id);

  if (agent.response_engine.type !== "conversation-flow") {
    throw new Error(`Retell agent ${AGENT_NAME} does not use Conversation Flow.`);
  }

  const version = agent.response_engine.version;
  if (typeof version !== "number") {
    throw new Error(`Retell agent ${AGENT_NAME} has no Conversation Flow version.`);
  }

  return {
    conversationFlowId: agent.response_engine.conversation_flow_id,
    conversationFlowVersion: version,
  };
}

async function waitForBatch(
  client: Retell,
  initialBatch: BatchTestResponse,
): Promise<BatchTestResponse> {
  const deadline = Date.now() + MAX_WAIT_MS;
  let batch = initialBatch;

  while (batch.status !== "complete") {
    if (Date.now() >= deadline) {
      throw new Error(
        `Retell batch ${batch.test_case_batch_job_id} did not finish within ${MAX_WAIT_MS / 60_000} minutes.`,
      );
    }

    await wait(POLL_INTERVAL_MS);
    batch = await client.tests.getBatchTest(batch.test_case_batch_job_id);
  }

  return batch;
}

async function listTestRuns(
  client: Retell,
  batchId: string,
): Promise<TestCaseJobResponse[]> {
  const runs: TestCaseJobResponse[] = [];
  let paginationKey: string | undefined;

  do {
    const response = await client.tests.listTestRuns(batchId, {
      limit: 100,
      pagination_key: paginationKey,
    });

    runs.push(...(response.items ?? []));
    paginationKey = response.has_more ? response.pagination_key : undefined;
  } while (paginationKey);

  return runs;
}

async function writeReport(
  batch: BatchTestResponse,
  runs: TestCaseJobResponse[],
): Promise<string> {
  const reportPath = path.join(
    REPORT_DIRECTORY,
    `${batch.test_case_batch_job_id}.json`,
  );

  await mkdir(REPORT_DIRECTORY, { recursive: true });
  await writeFile(
    reportPath,
    `${JSON.stringify({ batch, runs }, null, 2)}\n`,
    "utf8",
  );

  return reportPath;
}

async function main() {
  const client = new Retell({
    apiKey: requireEnvironmentVariable("RETELL_API_KEY_GENSTONE"),
  });
  const target = await resolveSimulationTarget(client);
  const desiredDefinitions = buildRetellSimulationDefinitions(target);
  const definitions = await upsertTestCaseDefinitions(
    client,
    desiredDefinitions,
    target,
  );
  const initialBatch = await client.tests.createBatchTest({
    response_engine: {
      type: "conversation-flow",
      conversation_flow_id: target.conversationFlowId,
      version: target.conversationFlowVersion,
    },
    test_case_definition_ids: definitions.map(
      (definition) => definition.test_case_definition_id,
    ),
  });
  const batch = await waitForBatch(client, initialBatch);
  const runs = await listTestRuns(client, batch.test_case_batch_job_id);
  const reportPath = await writeReport(batch, runs);
  const runSummaries = runs
    .map((run) => ({
      test_case_job_id: run.test_case_job_id,
      name: run.test_case_definition_snapshot.name,
      status: run.status,
      result_explanation: run.result_explanation,
    }))
    .sort((left, right) => left.name.localeCompare(right.name));

  console.log(
    JSON.stringify(
      {
        batch_id: batch.test_case_batch_job_id,
        status: batch.status,
        total: batch.total_count,
        passed: batch.pass_count,
        failed: batch.fail_count,
        errors: batch.error_count,
        report_path: reportPath,
        runs: runSummaries,
      },
      null,
      2,
    ),
  );

  if (batch.fail_count > 0 || batch.error_count > 0) {
    process.exitCode = 1;
  }
}

await main();
