import { Client, type QueryResult, type QueryResultRow } from "pg";
import type { CustomerAgentEnv } from "../../types/env";

export type Queryable = {
  query<T extends QueryResultRow = QueryResultRow>(
    text: string,
    values?: unknown[],
  ): Promise<QueryResult<T>>;
};

export async function withDatabase<T>(
  env: CustomerAgentEnv,
  callback: (client: Client) => Promise<T>,
): Promise<T> {
  const client = new Client({
    connectionString: getDatabaseConnectionString(env),
  });

  await client.connect();

  try {
    return await callback(client);
  } finally {
    await client.end();
  }
}

export async function withTransaction<T>(
  env: CustomerAgentEnv,
  callback: (client: Client) => Promise<T>,
): Promise<T> {
  return withDatabase(env, async (client) => {
    try {
      await client.query("begin");
      const result = await callback(client);
      await client.query("commit");
      return result;
    } catch (error) {
      await client.query("rollback");
      throw error;
    }
  });
}

export function getCompanyId(env: CustomerAgentEnv): string {
  return env.GENSTONE_COMPANY_ID || "genstone";
}

function getDatabaseConnectionString(env: CustomerAgentEnv): string {
  if (env.HYPERDRIVE?.connectionString) {
    return env.HYPERDRIVE.connectionString;
  }

  throw new Error("Missing required Hyperdrive binding: HYPERDRIVE.");
}
