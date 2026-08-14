import Retell from "retell-sdk";

function requireEnvironmentVariable(name: string): string {
  const value = process.env[name]?.trim();

  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
}

async function main() {
  const apiKey = requireEnvironmentVariable("RETELL_API_KEY_GENSTONE");
  const agentId = requireEnvironmentVariable("RETELL_AGENT_ID");
  const phoneNumber = requireEnvironmentVariable("RETELL_FROM_NUMBER_GENSTONE");

  const client = new Retell({ apiKey });
  const agent = await client.agent.retrieve(agentId);

  if (!agent.is_published) {
    try {
      await client.agent.publish(agentId, { version: agent.version });
    } catch (error) {
      const publishedAgent = await client.agent.retrieve(agentId);

      if (!publishedAgent.is_published) {
        throw error;
      }
    }
  }

  const binding = {
    agent_id: agentId,
    agent_version: agent.version,
    weight: 1,
  };

  const updatedPhoneNumber = await client.phoneNumber.update(phoneNumber, {
    inbound_agents: [binding],
    outbound_agents: [binding],
  });

  console.log(
    JSON.stringify(
      {
        agent_id: agentId,
        agent_version: agent.version,
        phone_number: updatedPhoneNumber.phone_number,
        published: true,
        inbound_bound: updatedPhoneNumber.inbound_agents?.some(
          (item) => item.agent_id === agentId,
        ),
        outbound_bound: updatedPhoneNumber.outbound_agents?.some(
          (item) => item.agent_id === agentId,
        ),
      },
      null,
      2,
    ),
  );
}

await main();
