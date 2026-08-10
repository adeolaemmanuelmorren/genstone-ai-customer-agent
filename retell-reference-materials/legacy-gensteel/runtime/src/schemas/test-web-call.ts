import { z } from "zod";

const stringValue = z.union([z.string(), z.number()]).transform((value) => String(value));
export const retellPromptAgentSchema = z.enum(["conversation_flow", "multi_prompt"]);

export const testWebCallPayloadSchema = z.object({
  order_id: stringValue,
  opportunity_id: stringValue.optional(),
  customer_email: z.string().email(),
  customer_name: z.string().optional(),
  escalation_email: z.string().email().optional(),
  callback_delay_seconds: z.number().int().min(1).max(3600).optional(),
  prompt_agent: retellPromptAgentSchema.optional(),
});

export type RetellPromptAgent = z.infer<typeof retellPromptAgentSchema>;
export type TestWebCallPayload = z.infer<typeof testWebCallPayloadSchema>;
